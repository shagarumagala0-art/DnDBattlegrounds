/**
 * Global application state
 */
export const state = {
  /** @type {Array<TokenData>} All tokens currently on the grid */
  tokens: [],

  /** @type {TokenData|null} Currently selected token */
  selectedToken: null,

  /** @type {Array<Object>} Loaded monster data from bestiaries */
  monsters: [],

  /** @type {Array<Object>} Imported/created player characters */
  characters: [],

  /** @type {Object|null} Monster staged for adding to arena */
  pendingMonster: null,
};

/**
 * @typedef {Object} TokenData
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} abbr - 3-letter abbreviation
 * @property {'monster'|'player'} type - Token type
 * @property {number} row - Grid row (0-19)
 * @property {number} col - Grid column (0-19)
 * @property {number} hp - Current HP
 * @property {number} maxHp - Maximum HP
 * @property {number} ac - Armor Class
 * @property {number} str - Strength score
 * @property {number} dex - Dexterity score
 * @property {number} con - Constitution score
 * @property {number} int - Intelligence score
 * @property {number} wis - Wisdom score
 * @property {number} cha - Charisma score
 * @property {string} color - Token color scheme
 * @property {Object|null} monsterData - Reference to original monster data
 * @property {number|null} initiative - Initiative roll result (null = not yet rolled)
 * @property {string[]} conditions - Active D&D conditions (e.g. 'prone', 'poisoned')
 */

/**
 * Find a token by ID
 * @param {string} id
 * @returns {TokenData|undefined}
 */
export function findToken(id) {
  return state.tokens.find(t => t.id === id);
}

/**
 * Find a token at specific grid position
 * @param {number} row
 * @param {number} col
 * @returns {TokenData|undefined}
 */
export function findTokenAtCell(row, col) {
  return state.tokens.find(t => t.row === row && t.col === col);
}

/**
 * Remove a token from state by ID
 * @param {string} id
 */
export function removeToken(id) {
  const idx = state.tokens.findIndex(t => t.id === id);
  if (idx !== -1) state.tokens.splice(idx, 1);
  if (state.selectedToken && state.selectedToken.id === id) {
    state.selectedToken = null;
  }
}

/**
 * Update HP for a token (clamps to 0..maxHp)
 * @param {string} id
 * @param {number} delta
 * @returns {TokenData|null}
 */
export function changeTokenHp(id, delta) {
  const token = findToken(id);
  if (!token) return null;
  token.hp = Math.max(0, Math.min(token.maxHp, token.hp + delta));
  return token;
}

/**
 * @param {string} id
 * @param {number} value
 * @returns {TokenData|null}
 */
export function setTokenHp(id, value) {
  const token = findToken(id);
  if (!token) return null;
  token.hp = Math.max(0, Math.min(token.maxHp, value));
  return token;
}
