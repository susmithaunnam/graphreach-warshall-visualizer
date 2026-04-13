/**
 * app.js
 * UI orchestration — matrix building, Warshall control flow,
 * step-by-step playback, result rendering.
 */

// ── STATE ────────────────────────────────────────────────────────
let n          = 4;
let adj        = [];          // current adjacency matrix (editable)
let originalAdj = [];         // snapshot before Warshall
let warshallSnapshots = [];   // from getWarshallSteps()
let currentStep = -1;         // which snapshot we're on (-1 = not started)
let finalReach  = [];         // full transitive closure
let isRunning   = false;

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  drawEmptyState();
  setClickCallback(onNodeClick);
  createMatrix();   // boot with default 4-node graph
});

// ── MATRIX CREATION ──────────────────────────────────────────────

function changeNodes(delta) {
  const input = document.getElementById('nodeCount');
  const val   = Math.max(1, Math.min(10, parseInt(input.value || n) + delta));
  input.value = val;
}

function createMatrix() {
  n = Math.max(1, Math.min(10, parseInt(document.getElementById('nodeCount').value) || 4));
  adj = Array.from({ length: n }, () => Array(n).fill(0));
  originalAdj = [];
  warshallSnapshots = [];
  currentStep = -1;
  finalReach  = [];
  isRunning   = false;

  renderAdjMatrix();
  drawGraph(adj, adj, adj, null, -1, -1, false);
  clearResults();
  resetStepUI();
}

function loadExample() {
  // Classic example: 4-node graph with interesting reachability
  const examples = [
    // 4-node
    [[0,1,0,0],[0,0,1,0],[0,0,0,1],[1,0,0,0]],
    // 5-node
    [[0,1,0,0,0],[0,0,1,0,0],[0,0,0,1,0],[0,0,0,0,1],[1,0,0,0,0]],
    // 4-node with partial
    [[0,1,1,0],[0,0,0,1],[0,0,0,1],[0,0,0,0]],
  ];

  const idx = n <= 4 ? (n === 4 ? 0 : 2) : 1;
  const ex  = n <= 5 ? examples[Math.min(idx, examples.length - 1)] : examples[2];
  const sz  = ex.length;

  document.getElementById('nodeCount').value = sz;
  n = sz;
  adj = ex.map(r => [...r]);
  originalAdj = [];
  warshallSnapshots = [];
  currentStep = -1;
  finalReach  = [];
  isRunning   = false;

  renderAdjMatrix();
  drawGraph(adj, adj, adj, null, -1, -1, true);
  clearResults();
  resetStepUI();
}

// ── MATRIX RENDERING ─────────────────────────────────────────────

function renderAdjMatrix() {
  const wrap = document.getElementById('matrixWrap');
  let h = '<table><tr><th></th>';

  for (let j = 0; j < n; j++) h += `<th>${j}</th>`;
  h += '</tr>';

  for (let i = 0; i < n; i++) {
    h += `<tr><th>${i}</th>`;
    for (let j = 0; j < n; j++) {
      const val = adj[i][j];
      const cls = i === j ? 'cell-diag' : val ? 'cell-one' : 'cell-zero';
      h += `<td class="${cls}">
        <input type="number" min="0" max="1" value="${val}"
          onchange="onCellChange(${i},${j},this.value)"
          title="Edge ${i}→${j}">
      </td>`;
    }
    h += '</tr>';
  }

  h += '</table>';
  wrap.innerHTML = h;
}

function onCellChange(i, j, val) {
  const v = Math.max(0, Math.min(1, parseInt(val) || 0));
  adj[i][j] = v;

  // Update cell style live
  const cells = document.querySelectorAll(`#matrixWrap table tr:nth-child(${i + 2}) td`);
  const cell  = cells[j];
  if (cell) {
    cell.className = i === j ? 'cell-diag' : v ? 'cell-one' : 'cell-zero';
  }

  // Reset algorithm state
  warshallSnapshots = [];
  currentStep  = -1;
  finalReach   = [];
  originalAdj  = [];
  isRunning    = false;

  drawGraph(adj, adj, adj, null, -1, -1, false);
  clearResults();
  resetStepUI();
}

function syncAdj() {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const sel = `#matrixWrap table tr:nth-child(${i + 2}) td:nth-child(${j + 2}) input`;
      const el  = document.querySelector(sel);
      if (el) adj[i][j] = Math.max(0, Math.min(1, parseInt(el.value) || 0));
    }
  }
}

// ── WARSHALL CONTROLS ────────────────────────────────────────────

function startWarshall() {
  if (!n) return;
  syncAdj();

  originalAdj       = adj.map(r => [...r]);
  warshallSnapshots = getWarshallSteps(adj, n);
  currentStep       = -1;
  isRunning         = true;

  const { R, steps, newEdges } = runWarshallAlgorithm(adj, n);
  finalReach = R;

  renderResultMatrix(R, originalAdj);
  renderReachBadge(R);
  populateLog(steps);

  // Animate the full graph with all new edges
  drawGraph(adj, R, originalAdj, null, -1, -1, true);
  setStepInfo('Complete', `Transitive closure computed — ${newEdges.length} new path(s) found`);
  setProgress(1);
}

function stepWarshall() {
  if (!n) return;

  // First call: initialise
  if (warshallSnapshots.length === 0) {
    syncAdj();
    originalAdj       = adj.map(r => [...r]);
    warshallSnapshots = getWarshallSteps(adj, n);
    currentStep       = -1;
    finalReach        = warshallSnapshots[warshallSnapshots.length - 1]?.matrix || adj;
    isRunning         = true;
    renderReachBadge(finalReach);
    populateLog(buildFlatSteps());
  }

  currentStep++;

  if (currentStep >= warshallSnapshots.length) {
    // All steps done
    setStepInfo('Done', 'All intermediate nodes processed');
    setProgress(1);
    drawGraph(adj, finalReach, originalAdj, null, -1, -1, false);
    renderResultMatrix(finalReach, originalAdj);
    return;
  }

  const snap = warshallSnapshots[currentStep];
  const progress = (currentStep + 1) / warshallSnapshots.length;

  setStepInfo(
    `k = ${snap.k}  (node ${snap.k} as intermediate)`,
    snap.discoveries.length > 0
      ? snap.discoveries.map(d => `${d.i} → ${d.j} via ${d.k}`).join('   |   ')
      : 'No new paths discovered at this step'
  );
  setProgress(progress);

  // Highlight k node, show current matrix state
  drawGraph(adj, snap.matrix, originalAdj, null, -1, snap.k, true);
  renderResultMatrix(snap.matrix, originalAdj);

  highlightLogStep(currentStep);
}

function replayAnimation() {
  if (!originalAdj.length) return;
  drawGraph(adj, finalReach.length ? finalReach : adj, originalAdj, null, -1, -1, true);
}

function resetAll() {
  cancelAnimationFrame(window._animId);
  warshallSnapshots = [];
  currentStep  = -1;
  finalReach   = [];
  originalAdj  = [];
  isRunning    = false;

  adj = Array.from({ length: n }, () => Array(n).fill(0));
  renderAdjMatrix();
  drawGraph(adj, adj, adj, null, -1, -1, false);
  clearResults();
  resetStepUI();
}

// ── RESULT MATRIX ────────────────────────────────────────────────

function renderResultMatrix(R, origAdj) {
  const wrap = document.getElementById('resultWrap');
  let h = '<table><tr><th></th>';

  for (let j = 0; j < n; j++) h += `<th>${j}</th>`;
  h += '</tr>';

  for (let i = 0; i < n; i++) {
    h += `<tr><th>${i}</th>`;
    for (let j = 0; j < n; j++) {
      const val    = R[i][j];
      const wasOrig = origAdj && origAdj[i][j];
      const isNew  = val && !wasOrig && i !== j;
      const cls    = val ? (isNew ? 'reach-new' : 'reach-one') : 'reach-zero';
      h += `<td class="${cls}" title="${val ? `${i} can reach ${j}${isNew ? ' (new)' : ''}` : `${i} cannot reach ${j}`}">${val}</td>`;
    }
    h += '</tr>';
  }

  h += '</table>';
  wrap.innerHTML = h;
}

function renderReachBadge(R) {
  let count = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (i !== j && R[i][j]) count++;

  const el = document.getElementById('reachBadge');
  el.innerHTML = count > 0
    ? `<span class="badge badge-yes">✔ ${count} reachable pair${count !== 1 ? 's' : ''}</span>`
    : `<span class="badge badge-no">No reachable pairs</span>`;
}

function clearResults() {
  document.getElementById('resultWrap').innerHTML = '<p class="empty-msg">Run the algorithm to see results.</p>';
  document.getElementById('reachBadge').innerHTML = '';
  document.getElementById('stepLog').innerHTML    = '';
}

// ── LOG ──────────────────────────────────────────────────────────

function populateLog(steps) {
  const log = document.getElementById('stepLog');
  log.innerHTML = steps.map((s, idx) => {
    const cls  = s.type === 'k' ? 'log-k' : 'log-new';
    return `<div class="log-line ${cls}" data-idx="${idx}">${s.message}</div>`;
  }).join('');
}

function buildFlatSteps() {
  const out = [];
  warshallSnapshots.forEach(snap => {
    out.push({ type: 'k', k: snap.k, message: `── k = ${snap.k} ──` });
    snap.discoveries.forEach(d =>
      out.push({ type: 'new', message: `  ${d.i} → ${d.j}  via  ${d.k}` })
    );
  });
  return out;
}

function highlightLogStep(stepIdx) {
  const log   = document.getElementById('stepLog');
  const lines = log.querySelectorAll('.log-k');
  lines.forEach(l => l.style.color = '');
  if (lines[stepIdx]) {
    lines[stepIdx].style.color = '#00e5ff';
    lines[stepIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function toggleLog() {
  const show = document.getElementById('showLog').checked;
  document.getElementById('stepLog').style.display = show ? 'block' : 'none';
}

// ── STEP UI ──────────────────────────────────────────────────────

function setStepInfo(label, detail) {
  document.querySelector('.step-label').textContent  = label;
  document.querySelector('.step-detail').textContent = detail;
}

function setProgress(fraction) {
  document.getElementById('progressFill').style.width = `${Math.round(fraction * 100)}%`;
}

function resetStepUI() {
  setStepInfo('Ready', 'Build a graph and run the algorithm');
  setProgress(0);
}

// ── NODE CLICK CALLBACK ──────────────────────────────────────────

function onNodeClick(nodeIndex) {
  // Called by graph.js when a node is clicked
  // App can react — currently graph.js handles highlight rendering
}