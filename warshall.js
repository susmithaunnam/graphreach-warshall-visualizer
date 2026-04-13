/**
 * warshall.js
 * Pure algorithm logic — no DOM, no canvas.
 * Exports: runWarshallAlgorithm(), getWarshallSteps()
 */

/**
 * Run Warshall's algorithm and return the full reachability matrix
 * along with a detailed log of every discovery.
 *
 * @param {number[][]} adj  - n×n adjacency matrix (0/1)
 * @param {number}     n    - number of nodes
 * @returns {{ R: number[][], steps: object[], newEdges: [number,number][] }}
 */
function runWarshallAlgorithm(adj, n) {
  // Deep-copy so we don't mutate the original
  const R = adj.map(row => [...row]);

  const steps = [];    // Detailed step records
  const newEdges = []; // Edges added by Warshall (not in original adj)

  for (let k = 0; k < n; k++) {
    // Mark start of each k-round
    steps.push({ type: 'k', k, message: `── Intermediate node k = ${k} ──` });

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!R[i][j] && R[i][k] && R[k][j]) {
          R[i][j] = 1;
          newEdges.push([i, j]);
          steps.push({
            type: 'new',
            k, i, j,
            message: `  ${i} → ${j}  via  ${k}`
          });
        }
      }
    }
  }

  return { R, steps, newEdges };
}

/**
 * Returns each k-round as a snapshot array, useful for step-by-step playback.
 * Each snapshot contains the matrix state after applying intermediate node k.
 *
 * @param {number[][]} adj
 * @param {number}     n
 * @returns {object[]}  array of { k, matrix, discoveries }
 */
function getWarshallSteps(adj, n) {
  const snapshots = [];
  const R = adj.map(row => [...row]);

  for (let k = 0; k < n; k++) {
    const discoveries = [];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (!R[i][j] && R[i][k] && R[k][j]) {
          R[i][j] = 1;
          discoveries.push({ i, j, k });
        }
      }
    }

    snapshots.push({ k, matrix: R.map(row => [...row]), discoveries });
  }

  return snapshots;
}