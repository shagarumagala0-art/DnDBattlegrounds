import { state } from './state.js';
import { rollD20, getModifier, formatModifier, getHpColorClass, showToast, getAbbr } from './utils.js';

let onCombatUpdateCb = null;

/**
 * Register callback for combat state changes
 */
export function onCombatUpdate(fn) {
  onCombatUpdateCb = fn;
}

/**
 * Roll initiative for all tokens and start combat
 */
export function rollAllInitiatives() {
  if (state.tokens.length === 0) {
    showToast('⚠️ No tokens on the arena!', 'warning');
    return;
  }

  state.combatants = [];
  state.round = 1;
  state.activeCombatantIdx = 0;

  for (const token of state.tokens) {
    const dexMod = getModifier(token.dex || 10);
    const roll = rollD20(dexMod);
    token.initiative = roll.total;

    state.combatants.push({
      tokenId: token.id,
      name: token.name,
      initiative: roll.total,
      type: token.type,
      hp: token.hp,
      maxHp: token.maxHp,
      dexMod,
    });
  }

  // Sort by initiative descending, then dex mod, then name
  state.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod;
    return a.name.localeCompare(b.name);
  });

  state.activeCombatantIdx = 0;
  renderInitiativeList();
  updateRoundCounter();
  showToast(`🎲 Initiative rolled! Round 1 begins — ${state.combatants[0]?.name}'s turn`, 'success', 3000);

  if (onCombatUpdateCb) onCombatUpdateCb();
}

/**
 * Set initiative for a specific combatant (player input)
 * @param {string} tokenId
 * @param {number} value
 */
export function setInitiative(tokenId, value) {
  const token = state.tokens.find(t => t.id === tokenId);
  if (token) token.initiative = value;

  const combatant = state.combatants.find(c => c.tokenId === tokenId);
  if (combatant) combatant.initiative = value;

  // Re-sort
  state.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.name.localeCompare(b.name);
  });

  renderInitiativeList();
}

/**
 * Advance to next turn in combat
 */
export function nextTurn() {
  if (state.combatants.length === 0) {
    showToast('⚠️ Roll initiative first!', 'warning');
    return;
  }

  state.activeCombatantIdx = (state.activeCombatantIdx + 1) % state.combatants.length;

  if (state.activeCombatantIdx === 0) {
    state.round++;
    showToast(`🔔 Round ${state.round} begins!`, 'info', 2000);
    updateRoundCounter();
  }

  const active = state.combatants[state.activeCombatantIdx];
  showToast(`⚔️ ${active.name}'s turn`, 'info', 1500);

  renderInitiativeList();
  if (onCombatUpdateCb) onCombatUpdateCb();
}

/**
 * Reset combat state
 */
export function resetCombat() {
  state.combatants = [];
  state.activeCombatantIdx = 0;
  state.round = 0;

  // Clear initiatives from tokens
  for (const token of state.tokens) {
    token.initiative = null;
  }

  renderInitiativeList();
  updateRoundCounter();
  showToast('🔄 Combat reset', 'info', 1500);
  if (onCombatUpdateCb) onCombatUpdateCb();
}

/**
 * Render the initiative list in the Combat tab
 */
export function renderInitiativeList() {
  const container = document.getElementById('initiative-list');
  if (!container) return;

  if (state.combatants.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎲</div>
        <p>No combat in progress.</p>
        <p class="empty-hint">Add tokens to the arena, then click "Roll Initiative" to begin.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  state.combatants.forEach((combatant, idx) => {
    const isActive = idx === state.activeCombatantIdx;
    const token = state.tokens.find(t => t.id === combatant.tokenId);
    const hp = token ? token.hp : combatant.hp;
    const maxHp = token ? token.maxHp : combatant.maxHp;
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
    const hpClass = getHpColorClass(hp, maxHp);
    const isDead = hp <= 0;

    const row = document.createElement('div');
    row.className = `initiative-row ${isActive ? 'initiative-active' : ''} ${isDead ? 'initiative-dead' : ''} type-${combatant.type}`;
    row.dataset.tokenId = combatant.tokenId;

    row.innerHTML = `
      <div class="init-order">${isActive ? '▶' : idx + 1}</div>
      <div class="init-badge init-badge-${combatant.type}">${getAbbr(combatant.name)}</div>
      <div class="init-details">
        <div class="init-name">${combatant.name}${isDead ? ' <span class="dead-label">☠</span>' : ''}</div>
        <div class="init-hp-bar-wrap">
          <div class="init-hp-bar ${hpClass}" style="width: ${hpPct}%"></div>
        </div>
        <div class="init-stats">
          <span class="init-stat">HP: <strong>${hp}/${maxHp}</strong></span>
        </div>
      </div>
      <div class="init-initiative">
        <span class="init-init-val">${combatant.initiative ?? '—'}</span>
        <span class="init-init-label">init</span>
      </div>
    `;

    container.appendChild(row);
  });
}

/**
 * Add a new combatant when token is added mid-combat
 * @param {Object} token
 */
export function addCombatant(token) {
  if (state.round === 0) return; // Not in combat

  const dexMod = getModifier(token.dex || 10);
  const roll = rollD20(dexMod);
  token.initiative = roll.total;

  state.combatants.push({
    tokenId: token.id,
    name: token.name,
    initiative: roll.total,
    type: token.type,
    hp: token.hp,
    maxHp: token.maxHp,
    dexMod,
  });

  state.combatants.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod;
    return a.name.localeCompare(b.name);
  });
  renderInitiativeList();
}

/**
 * Remove a combatant when token is removed
 * @param {string} tokenId
 */
export function removeCombatant(tokenId) {
  const idx = state.combatants.findIndex(c => c.tokenId === tokenId);
  if (idx === -1) return;

  state.combatants.splice(idx, 1);

  if (state.activeCombatantIdx >= state.combatants.length) {
    state.activeCombatantIdx = 0;
  }

  renderInitiativeList();
}

/**
 * Update round counter display
 */
export function updateRoundCounter() {
  const roundEl = document.getElementById('round-counter');
  const headerRound = document.getElementById('header-round');

  if (roundEl) roundEl.textContent = state.round || 0;
  if (headerRound) {
    headerRound.textContent = state.round > 0 ? `Round ${state.round}` : 'Round —';
  }
}

/**
 * Get the currently active combatant
 * @returns {Object|null}
 */
export function getActiveCombatant() {
  if (state.combatants.length === 0) return null;
  return state.combatants[state.activeCombatantIdx] || null;
}

/**
 * Update turn info in arena toolbar
 */
export function updateTurnInfo() {
  const el = document.getElementById('turn-info');
  if (!el) return;

  if (state.round === 0 || state.combatants.length === 0) {
    el.textContent = 'No combat';
    el.className = 'turn-info';
    return;
  }

  const active = getActiveCombatant();
  if (active) {
    el.innerHTML = `<span class="turn-indicator type-${active.type}">▶ ${active.name}</span> <span class="round-badge">R${state.round}</span>`;
    el.className = 'turn-info active';
  }
}


