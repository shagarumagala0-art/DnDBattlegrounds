/**
 * DnD Arena Pro — Main Application Module
 */

import { state, changeTokenHp, setTokenHp, findToken } from './state.js';
import {
  initGrid, addTokenToGrid, removeTokenFromGrid, renderTokens,
  deselectToken, clearGrid, onTokenSelect, onTokenDeselect
} from './grid.js';
import { loadBestiaries, searchMonsters, renderMonsterList, closeStatblock, openAddToArenaModal, createMonsterToken, parseMonsterAttacks, cleanActionName } from './monsters.js';
import { importCharacter, createCharacterToken, createManualCharacter, renderCharacterList } from './dicecloud.js';
import { getHpColorClass, showToast, formatModifier, getModifier, getAbbr, generateId, getSpellcastingModifier, rollDice } from './utils.js';

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileViewport();
  setupTabs();
  setupGrid();
  setupArenaToolbar();
  setupMonsterTab();
  setupCharactersTab();
  setupOverlays();
  setupTokenInfoPanel();

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
      hideTokenInfoPanel();
      showToast('🗑️ Arena cleared', 'info');
    }
  });
}

// ─── Token Info Panel ─────────────────────────────────────────────────────────

function setupTokenInfoPanel() {
  const hpAmountEl = document.getElementById('hp-amount');
  const parseHpAmount = () => {
    const val = parseInt(hpAmountEl?.value, 10);
    return isNaN(val) ? null : val;
  };

  document.getElementById('btn-hp-set')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const amt = parseHpAmount();
    if (amt === null) return;
    const token = setTokenHp(state.selectedToken.id, amt);
    if (token) {
      updateTokenInfoPanel(token);
      renderTokens();
    }
  });

  document.getElementById('btn-hp-add')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const amt = parseHpAmount();
    if (amt === null) return;
    const token = changeTokenHp(state.selectedToken.id, amt);
    if (token) {
      updateTokenInfoPanel(token);
      renderTokens();
    }
  });

  document.getElementById('btn-hp-sub')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const amt = parseHpAmount();
    if (amt === null) return;
    const token = changeTokenHp(state.selectedToken.id, -amt);
    if (token) {
      updateTokenInfoPanel(token);
      renderTokens();
    }
  });

  document.getElementById('btn-remove-token')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const id = state.selectedToken.id;
    removeTokenFromGrid(id);
    hideTokenInfoPanel();
    showToast('🗑️ Token removed', 'info');
  });

  // Roll buttons: single handler for all .token-roll-btn elements
  const rollResultEl = document.getElementById('token-roll-result');
  document.querySelectorAll('.token-roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mod = parseInt(btn.dataset.mod, 10) || 0;
      const label = btn.dataset.label || 'Check';
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + mod;
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      if (rollResultEl) {
        const boldLabel = document.createElement('strong');
        boldLabel.textContent = label;
        const boldTotal = document.createElement('strong');
        boldTotal.textContent = String(total);
        rollResultEl.replaceChildren(`🎲 `, boldLabel, `: d20(${d20})${modStr} = `, boldTotal);
      }
    });
  });

  // Attack roll and damage roll buttons (event delegation on the dynamic attack list)
  const attackListEl = document.getElementById('token-attack-list');
  if (attackListEl) {
    attackListEl.addEventListener('click', (e) => {
      const atkBtn = e.target.closest('.sb-atk-roll-btn');
      if (atkBtn) {
        const bonus = parseInt(atkBtn.dataset.bonus, 10);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const total = d20 + bonus;
        const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
        const name = atkBtn.closest('.sb-attack-row')?.querySelector('.sb-attack-name')?.textContent || 'Attack';
        const resultEl = atkBtn.closest('.sb-attack-row')?.querySelector('.sb-row-atk-result');
        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(total);
          resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal);
        }
        return;
      }

      const dmgBtn = e.target.closest('.sb-dmg-roll-btn');
      if (dmgBtn) {
        const damageParts = dmgBtn.dataset.damage.split('|');
        let totalDmg = 0;
        const rolls = [];
        damageParts.forEach(dice => {
          const result = rollDice(dice);
          totalDmg += result;
          rolls.push(`${dice}(${result})`);
        });
        const name = dmgBtn.closest('.sb-attack-row')?.querySelector('.sb-attack-name')?.textContent || 'Damage';
        const resultEl = dmgBtn.closest('.sb-attack-row')?.querySelector('.sb-row-dmg-result');
        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(totalDmg);
          resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal);
        }
      }
    });
  }
}

export function updateTokenInfoPanel(token) {
  const panel = document.getElementById('token-info-panel');
  if (!panel) return;

  document.getElementById('info-token-badge').textContent = token.abbr;
  document.getElementById('info-name').textContent = token.name;
  document.getElementById('info-type').textContent = token.type === 'monster' ? '👹 Monster' : '🧙 Player';
  document.getElementById('info-hp').textContent = `${token.hp}/${token.maxHp}`;
  document.getElementById('info-ac').textContent = token.ac;
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

  // Compute ability modifiers for roll buttons
  const strMod = getModifier(token.str || 10);
  const dexMod = getModifier(token.dex || 10);
  const conMod = getModifier(token.con || 10);
  const intMod = getModifier(token.int || 10);
  const wisMod = getModifier(token.wis || 10);
  const chaMod = getModifier(token.cha || 10);

  // Skill checks: use monster proficiency bonus if available, else raw ability modifier
  const monsterData = token.monsterData;
  const perceptionParsed = monsterData ? parseInt(monsterData.skill?.perception, 10) : NaN;
  const perceptionMod = !isNaN(perceptionParsed) ? perceptionParsed : wisMod;
  const stealthParsed = monsterData ? parseInt(monsterData.skill?.stealth, 10) : NaN;
  const stealthMod = !isNaN(stealthParsed) ? stealthParsed : dexMod;
  const { mod: spellcastingMod, ability: spellcastingAbility } = getSpellcastingModifier(intMod, wisMod, chaMod);

  // Saving throw: use monster save proficiency if available, else raw ability modifier
  const getSaveMod = (ability, fallback) => {
    if (monsterData?.save?.[ability] !== undefined) {
      const parsed = parseInt(monsterData.save[ability], 10);
      if (!isNaN(parsed)) return parsed;
    }
    return fallback;
  };

  const rollBtnData = [
    { id: 'roll-perception',  mod: perceptionMod,          label: 'Perception',   title: 'Perception check (WIS)' },
    { id: 'roll-stealth',     mod: stealthMod,             label: 'Stealth',      title: 'Stealth check (DEX)' },
    { id: 'roll-spellcasting',mod: spellcastingMod,        label: 'Spellcasting', title: `Spellcasting check (${spellcastingAbility})` },
    { id: 'roll-save-str',    mod: getSaveMod('str', strMod), label: 'STR Save', title: 'STR saving throw' },
    { id: 'roll-save-dex',    mod: getSaveMod('dex', dexMod), label: 'DEX Save', title: 'DEX saving throw' },
    { id: 'roll-save-con',    mod: getSaveMod('con', conMod), label: 'CON Save', title: 'CON saving throw' },
    { id: 'roll-save-int',    mod: getSaveMod('int', intMod), label: 'INT Save', title: 'INT saving throw' },
    { id: 'roll-save-wis',    mod: getSaveMod('wis', wisMod), label: 'WIS Save', title: 'WIS saving throw' },
    { id: 'roll-save-cha',    mod: getSaveMod('cha', chaMod), label: 'CHA Save', title: 'CHA saving throw' },
  ];

  for (const { id, mod, label, title } of rollBtnData) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.dataset.mod = mod;
    btn.dataset.label = label;
    btn.title = title;
    const modEl = btn.querySelector('.token-roll-mod');
    if (modEl) modEl.textContent = formatModifier(mod);
  }

  // Clear previous roll result when switching tokens
  const rollResult = document.getElementById('token-roll-result');
  if (rollResult) rollResult.replaceChildren();

  // Render attacks section (monsters only)
  const attackSection = document.getElementById('token-attacks-section');
  const attackListEl = document.getElementById('token-attack-list');
  if (attackSection && attackListEl) {
    attackListEl.replaceChildren();
    const attacks = token.monsterData ? parseMonsterAttacks(token.monsterData) : [];
    if (attacks.length > 0) {
      attacks.forEach(atk => {
        const displayName = cleanActionName(atk.name);

        const row = document.createElement('div');
        row.className = 'sb-attack-row';

        const header = document.createElement('div');
        header.className = 'sb-attack-row-header';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'sb-attack-name';
        nameSpan.title = displayName;
        nameSpan.textContent = displayName;

        const btnsDiv = document.createElement('div');
        btnsDiv.className = 'sb-attack-btns';

        if (!atk.isAoe) {
          const atkBtn = document.createElement('button');
          atkBtn.className = 'sb-atk-btn sb-atk-roll-btn';
          atkBtn.dataset.bonus = atk.hitBonus;
          atkBtn.title = `${displayName}: to hit`;
          const atkLabel = document.createElement('span');
          atkLabel.className = 'sb-atk-label';
          atkLabel.textContent = 'ATK';
          const atkVal = document.createElement('span');
          atkVal.className = 'sb-atk-val';
          atkVal.textContent = formatModifier(atk.hitBonus);
          atkBtn.append(atkLabel, atkVal);
          btnsDiv.appendChild(atkBtn);
        }

        const dmgBtn = document.createElement('button');
        dmgBtn.className = 'sb-atk-btn sb-dmg-roll-btn';
        dmgBtn.dataset.damage = atk.damageDice.join('|');
        dmgBtn.title = `${displayName}: damage`;
        const dmgLabel = document.createElement('span');
        dmgLabel.className = 'sb-atk-label';
        dmgLabel.textContent = 'DMG';
        const dmgVal = document.createElement('span');
        dmgVal.className = 'sb-atk-val';
        dmgVal.textContent = atk.damageDice[0] || '—';
        dmgBtn.append(dmgLabel, dmgVal);
        btnsDiv.appendChild(dmgBtn);

        header.append(nameSpan, btnsDiv);

        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'sb-attack-row-results';

        if (!atk.isAoe) {
          const atkResult = document.createElement('div');
          atkResult.className = 'sb-row-atk-result';
          resultsDiv.appendChild(atkResult);
        }

        const dmgResult = document.createElement('div');
        dmgResult.className = 'sb-row-dmg-result';
        resultsDiv.appendChild(dmgResult);

        row.append(header, resultsDiv);
        attackListEl.appendChild(row);
      });
      attackSection.classList.remove('hidden');
    } else {
      attackSection.classList.add('hidden');
    }
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
    };

    const charData = createManualCharacter(formData);
    const token = createCharacterToken(charData);
    charData.tokenId = token.id;

    const placed = addTokenToGrid(token);
    if (!placed) {
      showToast('⚠️ Arena is full!', 'warning');
      return;
    }

    renderCharacterList();
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

    renderCharacterList();
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
      added++;
    }

    closeAddModal();
    if (added > 0) {
      showToast(`🐉 Added ${added}x ${monster.name} to arena!`, 'success');
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function switchTab(tabName) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.click();
}
