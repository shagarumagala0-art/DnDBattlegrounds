import { state, findTokenAtCell, removeToken } from './state.js';
import { getHpColorClass } from './utils.js';

let GRID_ROWS = 20;
let GRID_COLS = 20;

let gridEl = null;

// Callbacks registered by app.js to avoid circular imports
let onTokenSelectCb = null;
let onTokenDeselectCb = null;

// Drag-and-drop state
let draggedTokenId = null;

// Touch drag state
let touchDragTokenId = null;
let touchGhostEl = null;

// Movement trail SVG overlay
let movementTrailSvg = null;
let movementTrailTimer = null;

// Cell size and gap used to compute pixel centres
const CELL_PX = 60;
const CELL_GAP = 1;
const CELL_STEP = CELL_PX + CELL_GAP; // 61px per cell

// D&D grid scale: each tile represents this many feet
const FEET_PER_TILE = 5;

// Movement trail timing (ms)
const TRAIL_FADE_DELAY_MS    = 3000;
const TRAIL_FADE_DURATION_MS = 500;

// Movement trail label dimensions (px)
const TRAIL_LABEL_W = 44;
const TRAIL_LABEL_H = 18;

/** Return the pixel centre of a grid cell (relative to gridEl). */
function getCellCenter(row, col) {
  return {
    x: col * CELL_STEP + CELL_PX / 2,
    y: row * CELL_STEP + CELL_PX / 2,
  };
}

/**
 * Create (or re-create) the SVG overlay used for movement trails.
 * Must be called after gridEl has been populated with cells.
 */
function initMovementTrail() {
  movementTrailSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  movementTrailSvg.classList.add('movement-trail-svg');
  movementTrailSvg.setAttribute('aria-hidden', 'true');
  gridEl.appendChild(movementTrailSvg);
}

/**
 * Draw a dotted movement trail from one grid cell to another.
 * Displays the straight-line distance (1 tile = 5 ft) as a label.
 * The trail fades out after 3 seconds.
 *
 * @param {number} fromRow
 * @param {number} fromCol
 * @param {number} toRow
 * @param {number} toCol
 */
function drawMovementTrail(fromRow, fromCol, toRow, toCol) {
  if (!movementTrailSvg) return;
  if (fromRow === toRow && fromCol === toCol) return;

  // Cancel any pending fade timer
  if (movementTrailTimer) {
    clearTimeout(movementTrailTimer);
    movementTrailTimer = null;
  }

  const from = getCellCenter(fromRow, fromCol);
  const to   = getCellCenter(toRow, toCol);

  const dr = toRow - fromRow;
  const dc = toCol - fromCol;
  // Straight-line (Euclidean) distance in tiles × 5 ft per tile.
  // This matches the visual dotted line and the D&D 5e variant rule
  // where diagonal movement costs the same as orthogonal movement.
  const distanceFt = Math.round(Math.sqrt(dr * dr + dc * dc) * FEET_PER_TILE);

  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;

  const ns = 'http://www.w3.org/2000/svg';

  // Clear previous trail
  movementTrailSvg.innerHTML = '';
  movementTrailSvg.classList.remove('movement-trail-fading');

  // Dashed line
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', from.x);
  line.setAttribute('y1', from.y);
  line.setAttribute('x2', to.x);
  line.setAttribute('y2', to.y);
  line.classList.add('movement-trail-line');

  // Small circle at the origin (old position)
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', from.x);
  circle.setAttribute('cy', from.y);
  circle.setAttribute('r', 6);
  circle.classList.add('movement-trail-origin');

  // Label background
  const labelBg = document.createElementNS(ns, 'rect');
  labelBg.setAttribute('x', mx - TRAIL_LABEL_W / 2);
  labelBg.setAttribute('y', my - TRAIL_LABEL_H / 2);
  labelBg.setAttribute('width', TRAIL_LABEL_W);
  labelBg.setAttribute('height', TRAIL_LABEL_H);
  labelBg.setAttribute('rx', 4);
  labelBg.classList.add('movement-trail-label-bg');

  // Distance label
  const label = document.createElementNS(ns, 'text');
  label.setAttribute('x', mx);
  label.setAttribute('y', my);
  label.classList.add('movement-trail-label');
  label.textContent = `${distanceFt} ft`;

  movementTrailSvg.append(line, circle, labelBg, label);

  // Fade out after the configured delay
  movementTrailTimer = setTimeout(() => {
    movementTrailSvg.classList.add('movement-trail-fading');
    movementTrailTimer = setTimeout(() => {
      movementTrailSvg.innerHTML = '';
      movementTrailSvg.classList.remove('movement-trail-fading');
      movementTrailTimer = null;
    }, TRAIL_FADE_DURATION_MS);
  }, TRAIL_FADE_DELAY_MS);
}

/**
 * Clear the movement trail immediately (e.g., when the grid is cleared).
 */
function clearMovementTrail() {
  if (movementTrailTimer) {
    clearTimeout(movementTrailTimer);
    movementTrailTimer = null;
  }
  if (movementTrailSvg) {
    movementTrailSvg.innerHTML = '';
    movementTrailSvg.classList.remove('movement-trail-fading');
  }
}

/**
 * Register callback for token selection
 * @param {Function} fn
 */
export function onTokenSelect(fn) {
  onTokenSelectCb = fn;
}

/**
 * Register callback for token deselection
 * @param {Function} fn
 */
export function onTokenDeselect(fn) {
  onTokenDeselectCb = fn;
}

/**
 * Initialize the battle grid
 * @param {HTMLElement} container
 */
export function initGrid(container) {
  gridEl = document.createElement('div');
  gridEl.id = 'grid-inner';
  gridEl.className = 'grid-inner';

  // Row/col count attributes for CSS
  gridEl.style.setProperty('--grid-cols', GRID_COLS);

  buildGridCells();
  initMovementTrail();

  container.appendChild(gridEl);
}

/**
 * Build (or rebuild) all grid cells inside gridEl.
 * Assumes gridEl is already created and GRID_ROWS/GRID_COLS are set.
 */
function buildGridCells() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = `grid-cell ${(r + c) % 2 === 0 ? 'cell-even' : 'cell-odd'}`;
      cell.dataset.row = r;
      cell.dataset.col = c;

      // Add coord label on edge cells
      if (r === 0) {
        const lbl = document.createElement('span');
        lbl.className = 'cell-coord';
        lbl.textContent = c + 1;
        cell.appendChild(lbl);
      }

      // Click on empty cell deselects the current token
      cell.addEventListener('click', () => {
        if (state.selectedToken) deselectToken();
      });

      // Drag-and-drop: allow drop on every cell
      cell.addEventListener('dragover', (e) => {
        if (!draggedTokenId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('cell-drag-over');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('cell-drag-over');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('cell-drag-over');
        if (!draggedTokenId) return;
        const token = state.tokens.find(t => t.id === draggedTokenId);
        if (!token) return;
        // Allow drop only if cell is empty or occupied by the same token
        const occupant = findTokenAtCell(r, c);
        if (!occupant || occupant.id === draggedTokenId) {
          const oldRow = token.row;
          const oldCol = token.col;
          token.row = r;
          token.col = c;
          drawMovementTrail(oldRow, oldCol, r, c);
        }
        draggedTokenId = null;
        renderTokens();
      });

      gridEl.appendChild(cell);
    }
  }
}

/**
 * Resize the battle grid to new dimensions and re-render all tokens.
 * Tokens that fall outside the new bounds are clamped to the nearest valid cell.
 * @param {number} rows
 * @param {number} cols
 */
export function resizeGrid(rows, cols) {
  GRID_ROWS = rows;
  GRID_COLS = cols;

  if (!gridEl) return;

  // Remove all existing cells (and the old SVG overlay)
  gridEl.innerHTML = '';
  movementTrailSvg = null;
  gridEl.style.setProperty('--grid-cols', GRID_COLS);

  buildGridCells();
  initMovementTrail();

  // Clamp any out-of-bounds tokens
  for (const token of state.tokens) {
    token.row = Math.min(token.row, GRID_ROWS - 1);
    token.col = Math.min(token.col, GRID_COLS - 1);
  }

  renderTokens();
}

/**
 * Get current grid dimensions
 * @returns {{rows: number, cols: number}}
 */
export function getGridSize() {
  return { rows: GRID_ROWS, cols: GRID_COLS };
}

/**
 * Handle a cell being clicked (kept for external callers)
 * @param {number} row
 * @param {number} col
 */
export function handleCellClick(row, col) {
  const clickedToken = findTokenAtCell(row, col);
  if (clickedToken) {
    if (state.selectedToken && state.selectedToken.id === clickedToken.id) {
      deselectToken();
    } else {
      selectToken(clickedToken);
    }
  } else {
    deselectToken();
  }
}

/**
 * Select a token
 * @param {Object} token
 */
function selectToken(token) {
  state.selectedToken = token;
  renderTokens();
  if (onTokenSelectCb) onTokenSelectCb(token);
}

/**
 * Deselect current token
 */
export function deselectToken() {
  state.selectedToken = null;
  renderTokens();
  if (onTokenDeselectCb) onTokenDeselectCb();
}

/**
 * Find the first empty cell on the grid (row-major order)
 * @returns {{row: number, col: number}|null}
 */
export function findEmptyCell() {
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (!findTokenAtCell(r, c)) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Add a token to the grid at the first available cell
 * @param {Object} tokenData - Token object (without row/col)
 * @returns {Object|null} - The placed token or null if grid is full
 */
export function addTokenToGrid(tokenData) {
  const cell = findEmptyCell();
  if (!cell) return null;

  const token = { ...tokenData, row: cell.row, col: cell.col };
  state.tokens.push(token);
  renderTokens();
  return token;
}

/**
 * Remove a token from the grid and state
 * @param {string} tokenId
 */
export function removeTokenFromGrid(tokenId) {
  removeToken(tokenId);
  renderTokens();
  if (onTokenDeselectCb) onTokenDeselectCb();
}

/**
 * Re-render all tokens on the grid
 */
export function renderTokens() {
  if (!gridEl) return;

  // Clear all existing token elements
  gridEl.querySelectorAll('.token').forEach(el => el.remove());

  // Remove all cell highlights
  gridEl.querySelectorAll('.cell-highlighted').forEach(el => {
    el.classList.remove('cell-highlighted');
  });

  // Draw each token
  for (const token of state.tokens) {
    const cellEl = gridEl.querySelector(`[data-row="${token.row}"][data-col="${token.col}"]`);
    if (!cellEl) continue;

    const tokenEl = createTokenElement(token);
    cellEl.appendChild(tokenEl);
  }
}

/**
 * Create a token DOM element
 * @param {Object} token
 * @returns {HTMLElement}
 */
function createTokenElement(token) {
  const el = document.createElement('div');
  el.className = `token token-${token.type}`;
  el.dataset.tokenId = token.id;

  if (state.selectedToken && state.selectedToken.id === token.id) {
    el.classList.add('token-selected');
  }

  // Dead tokens
  if (token.hp <= 0) {
    el.classList.add('token-dead');
  }

  const hpPct = token.maxHp > 0 ? Math.max(0, Math.min(100, (token.hp / token.maxHp) * 100)) : 100;
  el.innerHTML = `
    <span class="token-abbr">${token.abbr}</span>
    <div class="token-hp-track">
      <div class="token-hp-pip ${getHpColorClass(token.hp, token.maxHp)}" style="width: ${hpPct}%"></div>
    </div>
  `;

  // ── HTML5 Drag-and-Drop ──────────────────────────────────────
  el.draggable = true;

  el.addEventListener('dragstart', (e) => {
    draggedTokenId = token.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', token.id);
    // Defer the class addition so the browser captures the un-faded element as ghost
    requestAnimationFrame(() => el.classList.add('token-dragging'));
  });

  el.addEventListener('dragend', () => {
    draggedTokenId = null;
    // Clean up any lingering drag-over highlights
    gridEl.querySelectorAll('.cell-drag-over').forEach(c => c.classList.remove('cell-drag-over'));
    renderTokens();
  });

  // Click on the token itself selects / deselects it
  el.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent bubbling to the cell's click handler
    if (state.selectedToken && state.selectedToken.id === token.id) {
      deselectToken();
    } else {
      selectToken(token);
    }
  });

  // ── Touch drag-and-drop ──────────────────────────────────────
  el.addEventListener('touchstart', (e) => {
    touchDragTokenId = token.id;
    const touch = e.touches[0];

    // Create a ghost element that follows the finger
    touchGhostEl = el.cloneNode(true);
    touchGhostEl.classList.add('token-dragging', 'token-touch-ghost');
    touchGhostEl.style.position = 'fixed';
    touchGhostEl.style.pointerEvents = 'none';
    touchGhostEl.style.zIndex = '9999';
    touchGhostEl.style.width = el.offsetWidth + 'px';
    touchGhostEl.style.height = el.offsetHeight + 'px';
    touchGhostEl.style.transform = 'translate(-50%, -50%)';
    touchGhostEl.style.left = touch.clientX + 'px';
    touchGhostEl.style.top = touch.clientY + 'px';
    document.body.appendChild(touchGhostEl);
  }, { passive: false });

  el.addEventListener('touchmove', (e) => {
    if (!touchDragTokenId) return;
    e.preventDefault(); // prevent page scroll while dragging a token
    const touch = e.touches[0];

    if (touchGhostEl) {
      touchGhostEl.style.left = touch.clientX + 'px';
      touchGhostEl.style.top = touch.clientY + 'px';
    }

    // Highlight the cell under the finger
    gridEl.querySelectorAll('.cell-drag-over').forEach(c => c.classList.remove('cell-drag-over'));
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    const cellUnder = elementUnder && elementUnder.closest('.grid-cell');
    if (cellUnder) cellUnder.classList.add('cell-drag-over');
  }, { passive: false });

  el.addEventListener('touchend', (e) => {
    if (!touchDragTokenId) return;
    const touch = e.changedTouches[0];

    // Remove ghost
    if (touchGhostEl) {
      touchGhostEl.remove();
      touchGhostEl = null;
    }

    gridEl.querySelectorAll('.cell-drag-over').forEach(c => c.classList.remove('cell-drag-over'));

    // Find the cell under the finger at the moment of release
    const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
    const cellUnder = elementUnder && elementUnder.closest('.grid-cell');
    if (cellUnder) {
      const r = parseInt(cellUnder.dataset.row, 10);
      const c = parseInt(cellUnder.dataset.col, 10);
      const tok = state.tokens.find(t => t.id === touchDragTokenId);
      if (tok) {
        const occupant = findTokenAtCell(r, c);
        if (!occupant || occupant.id === touchDragTokenId) {
          const oldRow = tok.row;
          const oldCol = tok.col;
          tok.row = r;
          tok.col = c;
          drawMovementTrail(oldRow, oldCol, r, c);
        }
      }
    }

    touchDragTokenId = null;
    renderTokens();
  }, { passive: true });

  // Clean up if the touch sequence is cancelled (e.g. incoming call)
  el.addEventListener('touchcancel', () => {
    if (touchGhostEl) {
      touchGhostEl.remove();
      touchGhostEl = null;
    }
    gridEl.querySelectorAll('.cell-drag-over').forEach(c => c.classList.remove('cell-drag-over'));
    touchDragTokenId = null;
    renderTokens();
  }, { passive: true });

  return el;
}

/**
 * Update the visual of a specific token without full re-render
 * @param {string} tokenId
 */
export function updateTokenElement(tokenId) {
  renderTokens();
}

/**
 * Select a token by its ID (triggers the onTokenSelect callback)
 * @param {string} id
 */
export function selectTokenById(id) {
  const token = state.tokens.find(t => t.id === id);
  if (!token) return;
  state.selectedToken = token;
  renderTokens();
  if (onTokenSelectCb) onTokenSelectCb(token);
}

/**
 * Clear all tokens from the grid
 */
export function clearGrid() {
  state.tokens = [];
  state.selectedToken = null;
  clearMovementTrail();
  renderTokens();
}

/**
 * Get grid element (for event listeners)
 */
export function getGridElement() {
  return gridEl;
}
