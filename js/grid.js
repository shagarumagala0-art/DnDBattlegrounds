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
          token.row = r;
          token.col = c;
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

  // Remove all existing cells
  gridEl.innerHTML = '';
  gridEl.style.setProperty('--grid-cols', GRID_COLS);

  buildGridCells();

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
          tok.row = r;
          tok.col = c;
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
  renderTokens();
}

/**
 * Get grid element (for event listeners)
 */
export function getGridElement() {
  return gridEl;
}
