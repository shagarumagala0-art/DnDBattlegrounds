/**
 * DnD Arena Pro — Main Application Module
 */

import { state, changeTokenHp, findToken } from './state.js';
import {
  initGrid, addTokenToGrid, removeTokenFromGrid, renderTokens,
  deselectToken, clearGrid, onTokenSelect, onTokenDeselect
} from './grid.js';
import { loadBestiaries, searchMonsters, renderMonsterList, closeStatblock, openAddToArenaModal, createMonsterToken } from './monsters.js';
import { rollAllInitiatives, nextTurn, resetCombat, renderInitiativeList, updateTurnInfo, updateRoundCounter, addCombatant, removeCombatant, onCombatUpdate } from './combat.js';
import { importCharacter, createCharacterToken, createManualCharacter, renderCharacterList } from './dicecloud.js';
import { getHpColorClass, showToast, formatModifier, getModifier, getAbbr, generateId } from './utils.js';
import { populateAttackPanel, updateAttackActions, handleRollAttack, onAttackHit } from './attack.js';

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileViewport();
  setupTabs();
  setupGrid();
  setupArenaToolbar();
  setupMonsterTab();
  setupCombatTab();
  setupCharactersTab();
  setupOverlays();
  setupTokenInfoPanel();
  setupAttackPanel();

  onCombatUpdate(() => {
    updateTurnInfo();
    updateHeaderRound();
    populateAttackPanel();
  });

  // Refresh attack panel when HP changes from a hit
  onAttackHit((token) => {
    renderTokens();
    updateTokenInfoPanelIfSelected(token);
  });

  // Load monster data
  await loadBestiaries();

  // Initial monster render
  const monsters = searchMonsters('', '', '');
  renderMonsterList(monsters);
});

// ─── Mobile Viewport ─────────────────────────────────────────────────────────

function setupMobileViewport() {
  // Prevent pull-to-refresh and overscroll bounce
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('#grid-container')) return; // allow grid scroll
    if (e.target.closest('.overlay-content')) return; // allow overlay scroll
    if (e.target.closest('#monster-results')) return; // allow monster list scroll
    if (e.target.closest('#initiative-list')) return; // allow combat list scroll
    if (e.target.closest('#tab-characters')) return; // allow characters tab scroll
    e.preventDefault();
  }, { passive: false });

  // iOS safe area / status bar
  document.body.style.paddingTop = 'env(safe-area-inset-top)';
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.getElementById(`tab-${tab}`);
      if (content) content.classList.add('active');

      // Refresh content on tab switch
      if (tab === 'monsters') {
        const query = document.getElementById('monster-search')?.value || '';
        const cr = document.getElementById('cr-filter')?.value || '';
        const type = document.getElementById('type-filter')?.value || '';
        renderMonsterList(searchMonsters(query, cr, type));
      }
      if (tab === 'combat') {
        renderInitiativeList();
        updateRoundCounter();
        populateAttackPanel();
      }
      if (tab === 'characters') {
        renderCharacterList();
      }
    });
  });
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

function setupGrid() {
  const container = document.getElementById('battle-grid');
  if (!container) return;

  initGrid(container);

  // Token select callback
  onTokenSelect((token) => {
    updateTokenInfoPanel(token);
  });

  // Token deselect callback
  onTokenDeselect(() => {
    hideTokenInfoPanel();
  });
}

// ─── Arena Toolbar ────────────────────────────────────────────────────────────

function setupArenaToolbar() {
  document.getElementById('btn-add-monster')?.addEventListener('click', () => {
    // Switch to monsters tab
    switchTab('monsters');
    showToast('🐉 Search for a monster and click "Add" to place it on the arena.', 'info', 4000);
  });

  document.getElementById('btn-add-player')?.addEventListener('click', () => {
    switchTab('characters');
    showToast('👤 Create a player character below.', 'info', 3000);
  });

  document.getElementById('btn-clear-arena')?.addEventListener('click', () => {
    if (state.tokens.length === 0) return;
    if (confirm('Clear all tokens from the arena?')) {
      clearGrid();
      resetCombat();
      hideTokenInfoPanel();
      populateAttackPanel();
      showToast('🗑️ Arena cleared', 'info');
    }
  });
}

// ─── Token Info Panel ─────────────────────────────────────────────────────────

function setupTokenInfoPanel() {
  document.getElementById('btn-hp-minus')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const token = changeTokenHp(state.selectedToken.id, -1);
    if (token) {
      updateTokenInfoPanel(token);
      renderTokens();
      // Sync combatant display
      updateCombatantHp(token);
    }
  });

  document.getElementById('btn-hp-plus')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const token = changeTokenHp(state.selectedToken.id, 1);
    if (token) {
      updateTokenInfoPanel(token);
      renderTokens();
      updateCombatantHp(token);
    }
  });

  document.getElementById('btn-remove-token')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const id = state.selectedToken.id;
    removeCombatant(id);
    removeTokenFromGrid(id);
    hideTokenInfoPanel();
    populateAttackPanel();
    showToast('🗑️ Token removed', 'info');
  });
}

function updateCombatantHp(token) {
  const combatant = state.combatants.find(c => c.tokenId === token.id);
  if (combatant) {
    combatant.hp = token.hp;
    renderInitiativeList();
  }
  updateTurnInfo();
}

export function updateTokenInfoPanel(token) {
  const panel = document.getElementById('token-info-panel');
  if (!panel) return;

  document.getElementById('info-token-badge').textContent = token.abbr;
  document.getElementById('info-name').textContent = token.name;
  document.getElementById('info-type').textContent = token.type === 'monster' ? '👹 Monster' : '🧙 Player';
  document.getElementById('info-hp').textContent = `${token.hp}/${token.maxHp}`;
  document.getElementById('info-ac').textContent = token.ac;
  document.getElementById('info-initiative').textContent = token.initiative !== null ? token.initiative : '—';
  document.getElementById('info-position').textContent = `(${token.col + 1}, ${token.row + 1})`;

  const hpBar = document.getElementById('info-hp-bar');
  if (hpBar) {
    const pct = token.maxHp > 0 ? Math.max(0, Math.min(100, (token.hp / token.maxHp) * 100)) : 0;
    hpBar.style.width = `${pct}%`;
    hpBar.className = `hp-bar ${getHpColorClass(token.hp, token.maxHp)}`;
  }

  const badge = document.getElementById('info-token-badge');
  if (badge) {
    badge.className = `token-badge token-badge-${token.type}`;
  }

  panel.classList.remove('hidden');
}

function hideTokenInfoPanel() {
  const panel = document.getElementById('token-info-panel');
  if (panel) panel.classList.add('hidden');
}

// ─── Monster Tab ─────────────────────────────────────────────────────────────

function setupMonsterTab() {
  const searchInput = document.getElementById('monster-search');
  const crFilter = document.getElementById('cr-filter');
  const typeFilter = document.getElementById('type-filter');

  const doSearch = () => {
    const monsters = searchMonsters(
      searchInput?.value || '',
      crFilter?.value || '',
      typeFilter?.value || ''
    );
    renderMonsterList(monsters);
  };

  searchInput?.addEventListener('input', doSearch);
  crFilter?.addEventListener('change', doSearch);
  typeFilter?.addEventListener('change', doSearch);
}

// ─── Combat Tab ───────────────────────────────────────────────────────────────

function setupCombatTab() {
  document.getElementById('btn-roll-initiative')?.addEventListener('click', () => {
    rollAllInitiatives();
    populateAttackPanel();
  });
  document.getElementById('btn-next-turn')?.addEventListener('click', nextTurn);
  document.getElementById('btn-reset-combat')?.addEventListener('click', () => {
    resetCombat();
    updateTurnInfo();
    updateHeaderRound();
    populateAttackPanel();
  });
}

function updateHeaderRound() {
  const el = document.getElementById('header-round');
  if (el) el.textContent = state.round > 0 ? `Round ${state.round}` : 'Round —';
  updateRoundCounter();
  updateTurnInfo();
}

// ─── Characters Tab ───────────────────────────────────────────────────────────

function setupCharactersTab() {
  // DiceCloud import
  document.getElementById('btn-import-character')?.addEventListener('click', async () => {
    const url = document.getElementById('dicecloud-url')?.value || '';
    const charData = await importCharacter(url);
    if (charData) {
      state.characters.push(charData);
      renderCharacterList();
    }
  });

  // Custom player form
  document.getElementById('btn-add-custom-player')?.addEventListener('click', () => {
    const name = document.getElementById('player-name')?.value?.trim();
    const hp = parseInt(document.getElementById('player-hp')?.value);
    const ac = parseInt(document.getElementById('player-ac')?.value);

    if (!name) {
      showToast('⚠️ Please enter a character name.', 'warning');
      return;
    }
    if (!hp || hp < 1) {
      showToast('⚠️ Please enter valid HP.', 'warning');
      return;
    }
    if (!ac || ac < 1) {
      showToast('⚠️ Please enter valid AC.', 'warning');
      return;
    }

    const formData = {
      name,
      hp,
      ac,
      str: parseInt(document.getElementById('player-str')?.value) || 10,
      dex: parseInt(document.getElementById('player-dex')?.value) || 10,
      con: parseInt(document.getElementById('player-con')?.value) || 10,
      int: parseInt(document.getElementById('player-int')?.value) || 10,
      wis: parseInt(document.getElementById('player-wis')?.value) || 10,
      cha: parseInt(document.getElementById('player-cha')?.value) || 10,
      toHit: document.getElementById('player-tohit')?.value?.trim() || '',
      damage: document.getElementById('player-damage')?.value?.trim() || '',
    };

    const charData = createManualCharacter(formData);
    const token = createCharacterToken(charData);
    charData.tokenId = token.id;

    const placed = addTokenToGrid(token);
    if (!placed) {
      showToast('⚠️ Arena is full!', 'warning');
      return;
    }

    addCombatant(placed);
    renderCharacterList();
    populateAttackPanel();
    const nameEl = document.getElementById('player-name');
    const hpEl = document.getElementById('player-hp');
    const acEl = document.getElementById('player-ac');
    if (nameEl) nameEl.value = '';
    if (hpEl) hpEl.value = '';
    if (acEl) acEl.value = '';
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(s => {
      const el = document.getElementById(`player-${s}`);
      if (el) el.value = '10';
    });
    const toHitEl = document.getElementById('player-tohit');
    const dmgEl = document.getElementById('player-damage');
    if (toHitEl) toHitEl.value = '';
    if (dmgEl) dmgEl.value = '';

    showToast(`🧙 ${charData.name} added to arena!`, 'success');
    switchTab('arena');
  });

  // Add character from character list to arena
  document.addEventListener('addCharToArena', (e) => {
    const char = state.characters.find(c => c.id === e.detail.charId);
    if (!char) return;

    const token = createCharacterToken(char);
    char.tokenId = token.id;

    const placed = addTokenToGrid(token);
    if (!placed) {
      showToast('⚠️ Arena is full!', 'warning');
      return;
    }

    addCombatant(placed);
    renderCharacterList();
    populateAttackPanel();
    showToast(`🧙 ${char.name} added to arena!`, 'success');
    switchTab('arena');
  });
}

// ─── Overlays ─────────────────────────────────────────────────────────────────

function setupOverlays() {
  // Statblock overlay
  document.getElementById('statblock-close')?.addEventListener('click', () => {
    closeStatblock();
  });
  document.getElementById('btn-close-statblock')?.addEventListener('click', () => {
    closeStatblock();
  });
  document.querySelector('#statblock-overlay .overlay-backdrop')?.addEventListener('click', () => {
    closeStatblock();
  });

  // Add to Arena modal
  document.getElementById('modal-close')?.addEventListener('click', closeAddModal);
  document.getElementById('btn-cancel-add')?.addEventListener('click', closeAddModal);
  document.querySelector('#add-to-arena-modal .overlay-backdrop')?.addEventListener('click', closeAddModal);

  document.getElementById('btn-confirm-add')?.addEventListener('click', () => {
    const monster = state.pendingMonster;
    if (!monster) return;

    const count = parseInt(document.getElementById('modal-count')?.value) || 1;
    const hpOverride = parseInt(document.getElementById('modal-hp')?.value) || null;

    let added = 0;
    for (let i = 0; i < count; i++) {
      const token = createMonsterToken(monster, hpOverride);
      if (i > 0) {
        // Append number to name for duplicates
        token.name = `${monster.name} ${i + 1}`;
        token.abbr = token.abbr.slice(0, 2) + (i + 1 <= 9 ? (i + 1) : '#');
      }

      const placed = addTokenToGrid(token);
      if (!placed) {
        showToast('⚠️ Arena is full!', 'warning');
        break;
      }
      addCombatant(placed);
      added++;
    }

    closeAddModal();
    if (added > 0) {
      showToast(`🐉 Added ${added}x ${monster.name} to arena!`, 'success');
      populateAttackPanel();
      switchTab('arena');
    }
  });
}

function closeAddModal() {
  const modal = document.getElementById('add-to-arena-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  state.pendingMonster = null;
}

// ─── Attack Panel ─────────────────────────────────────────────────────────────

function setupAttackPanel() {
  const attackerSel = document.getElementById('attack-attacker');
  const rollBtn = document.getElementById('btn-roll-attack');

  attackerSel?.addEventListener('change', () => {
    updateAttackActions(attackerSel.value);
  });

  rollBtn?.addEventListener('click', () => {
    handleRollAttack();
    // Refresh attack panel dropdowns after HP changes
    populateAttackPanel();
  });

  // Populate once tokens are available
  populateAttackPanel();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateTokenInfoPanelIfSelected(token) {
  if (state.selectedToken && state.selectedToken.id === token.id) {
    updateTokenInfoPanel(token);
  }
}

function switchTab(tabName) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.click();
}
