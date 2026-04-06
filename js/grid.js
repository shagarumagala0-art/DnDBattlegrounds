import { state, findTokenAtCell, removeToken } from './state.js';
import { getHpColorClass } from './utils.js';

const GRID_ROWS = 20;
const GRID_COLS = 20;

let gridEl = null;

// Callbacks registered by app.js to avoid circular imports
let onTokenSelectCb = null;
let onTokenDeselectCb = null;

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

      cell.addEventListener('click', () => handleCellClick(r, c));
      cell.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleCellClick(r, c);
      }, { passive: false });

      gridEl.appendChild(cell);
    }
  }

  container.appendChild(gridEl);
}

/**
 * Handle a cell being clicked
 * @param {number} row
 * @param {number} col
 */
export function handleCellClick(row, col) {
  const clickedToken = findTokenAtCell(row, col);
  const selected = state.selectedToken;

  if (!selected) {
    // Nothing selected — try to select the token in this cell
    if (clickedToken) {
      selectToken(clickedToken);
    }
  } else {
    // Something is selected
    if (clickedToken && clickedToken.id === selected.id) {
      // Clicked same token — deselect
      deselectToken();
    } else if (clickedToken) {
      // Clicked a different token — select it instead
      selectToken(clickedToken);
    } else {
      // Clicked empty cell — move selected token here
      moveToken(selected, row, col);
    }
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
 * Move a token to a new cell
 * @param {Object} token
 * @param {number} row
 * @param {number} col
 */
function moveToken(token, row, col) {
  token.row = row;
  token.col = col;
  deselectToken();
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
