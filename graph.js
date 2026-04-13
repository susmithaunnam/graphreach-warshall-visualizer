/**
 * graph.js
 * All canvas rendering, animation, hover, and interaction logic.
 *
 * Public API (called from app.js):
 *   initCanvas()
 *   drawGraph(adj, reach, originalAdj, activeEdge, highlightNode, activeK)
 *   replayGraph(adj, reach, originalAdj)
 *   setClickCallback(fn)
 */

// ── CONFIG ─────────────────────────────────────────────────────
const CFG = {
  nodeRadius:  22,
  padding:     54,     // keep nodes inside canvas
  arrowLen:    11,
  arrowAngle:  Math.PI / 6,
  curvature:   28,     // offset for bidirectional edges
  selfLoopR:   14,
  animSpeed:   0.06,   // per frame progress for new edges
  fastSpeed:   0.10,
};

// ── COLOUR PALETTE ──────────────────────────────────────────────
const CLR = {
  bg:          '#050810',
  grid:        'rgba(255,255,255,0.025)',
  nodeGrad1:   '#1d4ed8',
  nodeGrad2:   '#0c2461',
  nodeStroke:  '#3b82f6',
  nodeHover:   '#60a5fa',
  nodeActive:  '#00e5ff',
  nodeK:       '#f97316',
  nodeText:    '#ffffff',
  edgeOrig:    '#475569',
  edgeNew:     '#00ff99',
  edgeActive:  '#f97316',
  selfLoop:    '#f97316',
  glowBlue:    'rgba(59,130,246,0.3)',
  glowCyan:    'rgba(0,229,255,0.35)',
  glowGreen:   'rgba(0,255,153,0.35)',
  glowOrange:  'rgba(249,115,22,0.4)',
};

// ── STATE ───────────────────────────────────────────────────────
let canvas, ctx;
let nodePositions   = [];
let hoveredNode     = -1;
let selectedNode    = -1;
let clickCallback   = null;
let animId          = null;
let animQueue       = [];   // edges waiting to animate
let drawnEdges      = [];   // edges fully drawn
let currentAdj      = [];
let currentReach    = [];
let currentOrigAdj  = [];
let currentActiveEdge  = null;   // { i, j } currently being highlighted
let currentHighlight   = -1;     // selected/clicked node
let currentActiveK     = -1;     // intermediate node being processed

// ── INIT ────────────────────────────────────────────────────────

/** Must be called once on page load. */
function initCanvas() {
  canvas = document.getElementById('graphCanvas');
  ctx    = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);
  canvas.addEventListener('click', onMouseClick);
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  const w    = wrap.clientWidth  || 640;
  const h    = Math.max(320, Math.round(w * 0.58));

  canvas.width  = w;
  canvas.height = h;

  // Recompute positions if we already have nodes
  if (currentAdj.length) {
    nodePositions = computePositions(currentAdj.length);
    renderStatic();
  } else {
    drawEmptyState();
  }
}

// ── PUBLIC API ──────────────────────────────────────────────────

/**
 * Draw (or redraw) the graph, optionally animating new edges.
 *
 * @param {number[][]} adj         Current adjacency matrix
 * @param {number[][]} reach       Reachability matrix (may equal adj)
 * @param {number[][]} originalAdj The untouched original adj matrix
 * @param {object|null} activeEdge { i, j } edge to highlight orange
 * @param {number}      highlightNode  node index to highlight (-1 = none)
 * @param {number}      activeK    intermediate node index (-1 = none)
 * @param {boolean}     animate    whether to animate new edges
 */
function drawGraph(adj, reach = null, originalAdj = null, activeEdge = null, highlightNode = -1, activeK = -1, animate = true) {
  cancelAnimationFrame(animId);

  const n = adj.length;
  currentAdj       = adj;
  currentReach     = reach    || adj;
  currentOrigAdj   = originalAdj || adj;
  currentActiveEdge   = activeEdge;
  currentHighlight    = highlightNode;
  currentActiveK      = activeK;

  nodePositions = computePositions(n);

  // Build edge lists
  drawnEdges = [];
  animQueue  = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (!currentReach[i][j]) continue;

      const isOrig = !!currentOrigAdj[i][j];
      const isNew  = !isOrig;
      const isAct  = activeEdge && activeEdge.i === i && activeEdge.j === j;

      const edge = { i, j, isOrig, isNew, isAct, progress: 1 };

      if (animate && isNew) {
        edge.progress = 0;
        animQueue.push(edge);
      } else {
        drawnEdges.push(edge);
      }
    }
  }

  // Shuffle animation order for visual flair
  animQueue.sort(() => Math.random() - 0.5);

  if (animQueue.length > 0 && animate) {
    startAnimation();
  } else {
    renderStatic();
  }
}

/** Replay the current graph state with fresh animation */
function replayGraph(adj, reach, originalAdj) {
  drawGraph(adj, reach, originalAdj, null, -1, -1, true);
}

/** Register a callback for when the user clicks a node */
function setClickCallback(fn) {
  clickCallback = fn;
}

// ── LAYOUT ──────────────────────────────────────────────────────

function computePositions(n) {
  const w   = canvas.width;
  const h   = canvas.height;
  const cx  = w / 2;
  const cy  = h / 2;
  const r   = Math.min(w, h) / 2 - CFG.padding;

  if (n === 1) return [{ x: cx, y: cy }];

  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  });
}

// ── ANIMATION ───────────────────────────────────────────────────

function startAnimation() {
  animId = requestAnimationFrame(animFrame);
}

function animFrame() {
  if (animQueue.length === 0) {
    renderStatic();
    return;
  }

  // Advance current edge
  const edge = animQueue[0];
  edge.progress = Math.min(1, edge.progress + (edge.isNew ? CFG.animSpeed : CFG.fastSpeed));

  if (edge.progress >= 1) {
    drawnEdges.push(animQueue.shift());
  }

  renderFrame(animQueue.length > 0 ? animQueue[0] : null);
  animId = requestAnimationFrame(animFrame);
}

// ── RENDER ──────────────────────────────────────────────────────

function renderStatic() {
  renderFrame(null);
}

function renderFrame(partialEdge) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBg();

  // Self-loops (always on top of bg, below edges)
  for (let i = 0; i < currentAdj.length; i++) {
    if (currentAdj[i][i]) drawSelfLoop(i);
  }

  // Drawn edges (full)
  drawnEdges.forEach(e => drawEdge(e, 1));

  // Partial edge (animating)
  if (partialEdge) drawEdge(partialEdge, partialEdge.progress);

  drawAllNodes();
}

// ── BACKGROUND ──────────────────────────────────────────────────

function drawBg() {
  ctx.fillStyle = CLR.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dot grid
  ctx.fillStyle = CLR.grid;
  const step = 32;
  for (let x = step; x < canvas.width; x += step) {
    for (let y = step; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── EDGES ───────────────────────────────────────────────────────

function drawEdge(edge, alpha) {
  const { i, j, isOrig, isNew, isAct, progress } = edge;
  const from = nodePositions[i];
  const to   = nodePositions[j];

  // Determine color
  let color;
  if (isAct) {
    color = CLR.edgeActive;
  } else if (isNew) {
    color = CLR.edgeNew;
  } else {
    color = CLR.edgeOrig;
  }

  // If a node is selected, dim unrelated edges
  let finalAlpha = alpha;
  if (selectedNode !== -1) {
    if (i !== selectedNode && j !== selectedNode) finalAlpha *= 0.15;
  }
  if (hoveredNode !== -1 && selectedNode === -1) {
    if (i !== hoveredNode && j !== hoveredNode) finalAlpha *= 0.2;
  }

  // Curve offset for bidirectional
  const hasBoth = currentReach[j] && currentReach[j][i];
  const curve   = hasBoth ? (i < j ? CFG.curvature : -CFG.curvature) : 0;

  // Start/end offset from node centres
  const fromPt = offsetPoint(from, to, CFG.nodeRadius + 2);
  const endPt  = offsetPoint(to, from, CFG.nodeRadius + 8);

  // Partial target
  const toPt = {
    x: fromPt.x + (endPt.x - fromPt.x) * progress,
    y: fromPt.y + (endPt.y - fromPt.y) * progress
  };

  const drawHead = progress >= 0.98;

  ctx.save();
  ctx.globalAlpha = finalAlpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = isAct ? 2.5 : isNew ? 2.2 : 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur  = isAct ? 20 : isNew ? 14 : 5;

  ctx.beginPath();

  if (curve !== 0) {
    const cp = curveControlPoint(fromPt, toPt, curve);
    ctx.moveTo(fromPt.x, fromPt.y);
    ctx.quadraticCurveTo(cp.x, cp.y, toPt.x, toPt.y);
    ctx.stroke();
    if (drawHead) drawArrowHeadCurved(cp, toPt, color);
  } else {
    ctx.moveTo(fromPt.x, fromPt.y);
    ctx.lineTo(toPt.x, toPt.y);
    ctx.stroke();
    if (drawHead) drawArrowHeadStraight(fromPt, toPt, color);
  }

  ctx.restore();
}

function curveControlPoint(from, to, offset) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.y - from.y;
  const dy = from.x - to.x;
  const norm = Math.hypot(dx, dy) || 1;
  return { x: mx + (dx / norm) * offset, y: my + (dy / norm) * offset };
}

function drawArrowHeadStraight(from, to, color) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  drawArrowHead(to, angle, color);
}

function drawArrowHeadCurved(cp, to, color) {
  const angle = Math.atan2(to.y - cp.y, to.x - cp.x);
  drawArrowHead(to, angle, color);
}

function drawArrowHead(tip, angle, color) {
  const L = CFG.arrowLen;
  const A = CFG.arrowAngle;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - L * Math.cos(angle - A), tip.y - L * Math.sin(angle - A));
  ctx.lineTo(tip.x - L * Math.cos(angle + A), tip.y - L * Math.sin(angle + A));
  ctx.closePath();
  ctx.fill();
}

function drawSelfLoop(i) {
  const { x, y } = nodePositions[i];
  const lx = x;
  const ly = y - CFG.nodeRadius - CFG.selfLoopR;

  ctx.save();
  ctx.strokeStyle = CLR.selfLoop;
  ctx.lineWidth   = 2;
  ctx.shadowColor = CLR.selfLoop;
  ctx.shadowBlur  = 10;
  ctx.beginPath();
  ctx.arc(lx, ly, CFG.selfLoopR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── NODES ────────────────────────────────────────────────────────

function drawAllNodes() {
  nodePositions.forEach((pos, i) => drawNode(pos, i));
}

function drawNode({ x, y }, i) {
  const isHovered  = i === hoveredNode;
  const isSelected = i === selectedNode;
  const isK        = i === currentActiveK;

  // Determine glow / stroke colour
  let strokeColor = CLR.nodeStroke;
  let glowColor   = CLR.glowBlue;

  if (isK)        { strokeColor = CLR.nodeK;     glowColor = CLR.glowOrange; }
  if (isSelected) { strokeColor = CLR.nodeActive; glowColor = CLR.glowCyan;  }
  if (isHovered && !isSelected) { strokeColor = CLR.nodeHover; glowColor = CLR.glowBlue; }

  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = isSelected ? 28 : isHovered ? 22 : isK ? 24 : 14;

  // Gradient fill
  const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, CFG.nodeRadius);
  g.addColorStop(0, isK ? '#f97316' : '#3b82f6');
  g.addColorStop(1, isK ? '#7c2d12' : '#0c2461');

  ctx.beginPath();
  ctx.arc(x, y, CFG.nodeRadius, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = isSelected || isK ? 2.5 : 1.8;
  ctx.stroke();

  // Label
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = CLR.nodeText;
  ctx.font        = `bold 13px 'JetBrains Mono', monospace`;
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(i, x, y);

  ctx.restore();
}

// ── EMPTY STATE ──────────────────────────────────────────────────

function drawEmptyState() {
  if (!canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBg();

  ctx.fillStyle = 'rgba(71,85,105,0.5)';
  ctx.font      = "14px 'JetBrains Mono', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Build a graph to visualize', canvas.width / 2, canvas.height / 2);
}

// ── INTERACTION ──────────────────────────────────────────────────

function onMouseMove(e) {
  const { mx, my } = getCanvasXY(e);
  const hit = nodeAtPoint(mx, my);

  if (hit !== hoveredNode) {
    hoveredNode = hit;
    renderStatic();

    // Show tooltip
    if (hit !== -1) {
      showTooltip(e, buildNodeTooltip(hit));
    } else {
      hideTooltip();
    }
  } else if (hit !== -1) {
    moveTooltip(e);
  }
}

function onMouseLeave() {
  hoveredNode = -1;
  hideTooltip();
  renderStatic();
}

function onMouseClick(e) {
  const { mx, my } = getCanvasXY(e);
  const hit = nodeAtPoint(mx, my);

  if (hit === -1) {
    selectedNode = -1;
  } else {
    selectedNode = selectedNode === hit ? -1 : hit;
  }

  currentHighlight = selectedNode;
  renderStatic();

  if (clickCallback) clickCallback(selectedNode);
}

function buildNodeTooltip(i) {
  const n       = currentAdj.length;
  const reachTo = [];
  const reachFrom = [];

  for (let j = 0; j < n; j++) {
    if (j !== i) {
      if (currentReach[i] && currentReach[i][j]) reachTo.push(j);
      if (currentReach[j] && currentReach[j][i]) reachFrom.push(j);
    }
  }

  const lines = [`Node ${i}`];
  if (reachTo.length)   lines.push(`→ reaches: ${reachTo.join(', ')}`);
  if (reachFrom.length) lines.push(`← from: ${reachFrom.join(', ')}`);
  if (!reachTo.length && !reachFrom.length) lines.push('No connections');

  return lines.join('\n');
}

// ── TOOLTIP ──────────────────────────────────────────────────────

function showTooltip(e, text) {
  const el = document.getElementById('globalTooltip');
  el.innerHTML = text.split('\n').map((l, i) =>
    `<div style="${i === 0 ? 'font-weight:700;color:#00e5ff;' : ''}">${l}</div>`
  ).join('');
  el.classList.add('show');
  moveTooltip(e);
}

function moveTooltip(e) {
  const el = document.getElementById('globalTooltip');
  const x = e.clientX + 14;
  const y = e.clientY - 10;
  el.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
  el.style.top  = `${y}px`;
}

function hideTooltip() {
  document.getElementById('globalTooltip').classList.remove('show');
}

// ── HELPERS ──────────────────────────────────────────────────────

function getCanvasXY(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * scaleX,
    my: (e.clientY - rect.top)  * scaleY
  };
}

function nodeAtPoint(x, y) {
  return nodePositions.findIndex(p =>
    Math.hypot(p.x - x, p.y - y) < CFG.nodeRadius + 4
  );
}

function offsetPoint(from, to, dist) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return {
    x: from.x + dist * Math.cos(angle),
    y: from.y + dist * Math.sin(angle)
  };
}