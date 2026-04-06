/**
 * DnD Arena Pro — Main Application Module
 */

import { state, changeTokenHp, setTokenHp, findToken } from './state.js';
import {
  initGrid, addTokenToGrid, removeTokenFromGrid, renderTokens,
  deselectToken, clearGrid, onTokenSelect, onTokenDeselect, selectTokenById,
  resizeGrid, getGridSize
} from './grid.js';
import { loadBestiaries, loadSpells, searchMonsters, renderMonsterList, closeStatblock, openAddToArenaModal, createMonsterToken, parseMonsterAttacks, cleanActionName } from './monsters.js';
import { createCharacterToken, renderCharacterList, getCharacterAttacks, parseCharacterStatblock } from './dicecloud.js';
import { parseGSheetJSON } from './import.js';
import { getHpColorClass, showToast, formatModifier, getModifier, getAbbr, generateId, getSpellcastingModifier, rollDice, formatSpeed } from './utils.js';

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileViewport();
  setupTabs();
  setupGrid();
  setupArenaToolbar();
  setupSetArenaModal();
  setupMonsterTab();
  setupCharactersTab();
  setupOverlays();
  setupTokenInfoPanel();
  setupCharacterSheetOverlay();
  setupOverviewTab();

  // Load monster data and spell details
  await loadBestiaries();
  await loadSpells();

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
    if (e.target.closest('#token-info-panel')) return; // allow token info panel scroll
    if (e.target.closest('#tab-overview')) return; // allow overview tab scroll
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
      if (tab === 'overview') {
        renderOverview();
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

  document.getElementById('btn-set-arena')?.addEventListener('click', openSetArenaModal);
}

// ─── Set Arena Modal ──────────────────────────────────────────────────────────

function openSetArenaModal() {
  const modal = document.getElementById('set-arena-modal');
  if (!modal) return;
  const { rows, cols } = getGridSize();
  const rowsInput = document.getElementById('arena-rows-input');
  const colsInput = document.getElementById('arena-cols-input');
  if (rowsInput) rowsInput.value = rows;
  if (colsInput) colsInput.value = cols;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSetArenaModal() {
  const modal = document.getElementById('set-arena-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

function setupSetArenaModal() {
  document.getElementById('set-arena-modal-close')?.addEventListener('click', closeSetArenaModal);
  document.getElementById('btn-cancel-set-arena')?.addEventListener('click', closeSetArenaModal);
  document.querySelector('#set-arena-modal .overlay-backdrop')?.addEventListener('click', closeSetArenaModal);

  document.getElementById('btn-confirm-set-arena')?.addEventListener('click', () => {
    const rowsVal = parseInt(document.getElementById('arena-rows-input')?.value, 10);
    const colsVal = parseInt(document.getElementById('arena-cols-input')?.value, 10);

    const rows = Number.isFinite(rowsVal) ? Math.max(5, Math.min(50, rowsVal)) : 20;
    const cols = Number.isFinite(colsVal) ? Math.max(5, Math.min(50, colsVal)) : 20;

    resizeGrid(rows, cols);
    closeSetArenaModal();
    showToast(`⚙️ Arena resized to ${rows}×${cols}`, 'info');
  });
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function setupOverviewTab() {
  // Event delegation: clicking an overview row selects the token on the arena
  const listEl = document.getElementById('overview-list');
  if (!listEl) return;

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.overview-token-row');
    if (!row) return;
    const tokenId = row.dataset.tokenId;
    if (!tokenId) return;

    // Switch to arena tab and select the token to open the combat view
    switchTab('arena');
    selectTokenById(tokenId);
  });
}

/**
 * Render (or refresh) the overview list.
 * Tokens are sorted by initiative (highest first; not-rolled tokens go last).
 */
function renderOverview() {
  const listEl = document.getElementById('overview-list');
  if (!listEl) return;

  listEl.replaceChildren();

  if (state.tokens.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'overview-empty';
    empty.innerHTML = `
      <div class="empty-icon">⚔️</div>
      <p>No tokens on the arena yet.</p>
      <p>Add monsters or players from the other tabs.</p>
    `;
    listEl.appendChild(empty);
    return;
  }

  // Sort: tokens with initiative first (highest → lowest), then unrolled tokens
  const sorted = [...state.tokens].sort((a, b) => {
    const aHas = a.initiative !== null && a.initiative !== undefined;
    const bHas = b.initiative !== null && b.initiative !== undefined;
    if (aHas && bHas) return b.initiative - a.initiative;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });

  for (const token of sorted) {
    const row = document.createElement('div');
    row.className = 'overview-token-row';
    row.dataset.tokenId = token.id;

    // Initiative badge
    const initEl = document.createElement('div');
    const hasInit = token.initiative !== null && token.initiative !== undefined;
    initEl.className = 'overview-initiative' + (hasInit ? '' : ' not-rolled');
    initEl.textContent = hasInit ? token.initiative : '—';

    // Token badge (colored circle with abbreviation)
    const badge = document.createElement('div');
    badge.className = `token-badge token-badge-${token.type}`;
    badge.textContent = token.abbr;

    // Info section (name + hp)
    const info = document.createElement('div');
    info.className = 'overview-token-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'overview-token-name';
    nameEl.textContent = token.name;

    const hpEl = document.createElement('div');
    hpEl.className = 'overview-token-hp';
    hpEl.textContent = `HP: ${token.hp} / ${token.maxHp}`;

    const hpBarWrap = document.createElement('div');
    hpBarWrap.className = 'overview-hp-bar';
    const hpFill = document.createElement('div');
    hpFill.className = `overview-hp-fill ${getHpColorClass(token.hp, token.maxHp)}`;
    const pct = token.maxHp > 0 ? Math.max(0, Math.min(100, (token.hp / token.maxHp) * 100)) : 0;
    hpFill.style.width = `${pct}%`;
    hpBarWrap.appendChild(hpFill);

    info.append(nameEl, hpEl, hpBarWrap);
    row.append(initEl, badge, info);
    listEl.appendChild(row);
  }
}

// ─── Token Info Panel ─────────────────────────────────────────────────────────

/**
 * Schedule a result element to fade out after 2 seconds and then clear its content.
 * @param {HTMLElement} el
 */
function scheduleResultFade(el) {
  clearTimeout(el._fadeTimer);
  el.classList.remove('result-fading');
  el._fadeTimer = setTimeout(() => {
    el.classList.add('result-fading');
    setTimeout(() => {
      el.replaceChildren();
      el.classList.remove('result-fading');
    }, 500);
  }, 2000);
}

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

  document.getElementById('btn-close-panel')?.addEventListener('click', () => {
    deselectToken();
    hideTokenInfoPanel();
  });

  document.getElementById('btn-remove-token')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const id = state.selectedToken.id;
    removeTokenFromGrid(id);
    hideTokenInfoPanel();
    showToast('🗑️ Token removed', 'info');
  });

  document.getElementById('btn-roll-initiative')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const token = state.selectedToken;
    const dexMod = getModifier(token.dex || 10);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + dexMod;
    token.initiative = total;
    const el = document.getElementById('info-initiative');
    if (el) el.textContent = total;
    const input = document.getElementById('initiative-input');
    if (input) input.value = '';
    const modStr = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`;
    showToast(`⚡ Initiative: d20(${d20})${modStr} = ${total}`, 'info', 2000);
  });

  document.getElementById('btn-set-initiative')?.addEventListener('click', () => {
    if (!state.selectedToken) return;
    const input = document.getElementById('initiative-input');
    const val = parseInt(input?.value, 10);
    if (isNaN(val)) return;
    state.selectedToken.initiative = val;
    const el = document.getElementById('info-initiative');
    if (el) el.textContent = val;
    if (input) input.value = '';
  });

  document.getElementById('conditions-grid')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.condition-chip');
    if (!chip || !state.selectedToken) return;
    const condition = chip.dataset.condition;
    const token = state.selectedToken;
    if (!Array.isArray(token.conditions)) token.conditions = [];
    const idx = token.conditions.indexOf(condition);
    if (idx === -1) {
      token.conditions.push(condition);
      chip.classList.add('active');
    } else {
      token.conditions.splice(idx, 1);
      chip.classList.remove('active');
    }
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
        const attackRow = atkBtn.closest('.sb-attack-row');
        const bonus = parseInt(atkBtn.dataset.bonus, 10);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const isCrit = d20 === 20;
        if (attackRow) attackRow.dataset.critical = isCrit ? 'true' : '';
        const total = d20 + bonus;
        const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Attack';
        const resultEl = attackRow?.querySelector('.sb-row-atk-result');

        // Check if the roll hits the target's AC
        const targetToken = getSelectedTargetToken();
        const targetAc = targetToken ? (targetToken.ac || 10) : null;
        const hits = targetToken ? (isCrit || total >= targetAc) : null;
        if (attackRow && targetToken) {
          attackRow.dataset.attackHit = hits ? 'true' : 'false';
        }

        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(total);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' CRITICAL HIT!';
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal, critSpan);
          } else if (targetToken) {
            const hitSpan = document.createElement('span');
            hitSpan.textContent = hits ? ` HIT (AC ${targetAc})` : ` MISS (AC ${targetAc})`;
            hitSpan.style.color = hits ? 'var(--hp-full, #2ecc71)' : 'var(--text-dim, #6e6555)';
            resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal, hitSpan);
          } else {
            resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal);
          }
          scheduleResultFade(resultEl);
        }
        return;
      }

      const dmgBtn = e.target.closest('.sb-dmg-roll-btn');
      if (dmgBtn) {
        const attackRow = dmgBtn.closest('.sb-attack-row');
        const isCrit = attackRow?.dataset.critical === 'true';
        if (attackRow) attackRow.dataset.critical = '';
        const damageParts = dmgBtn.dataset.damage.split('|');
        const damageTypesParts = (dmgBtn.dataset.damageTypes || '').split('|');

        // Roll each damage part once and compute resist/immune-adjusted totals
        const targetToken = getSelectedTargetToken();
        const m = targetToken?.monsterData;
        const resistTypes = m ? flattenDamageTypes(m.resist, 'resist') : [];
        const immuneTypes = m ? flattenDamageTypes(m.immune, 'immune') : [];

        let totalDmg = 0;
        let appliedDmg = 0;
        const rolls = [];
        damageParts.forEach((dice, idx) => {
          const effectiveDice = isCrit ? doubleDiceNotation(dice) : dice;
          const raw = rollDice(effectiveDice);
          totalDmg += raw;
          const dmgType = (damageTypesParts[idx] || '').toLowerCase();
          rolls.push(dmgType ? `${effectiveDice}(${raw}) ${dmgType}` : `${effectiveDice}(${raw})`);

          if (targetToken) {
            if (dmgType && immuneTypes.includes(dmgType)) {
              // immune: contributes 0
            } else if (dmgType && resistTypes.includes(dmgType)) {
              appliedDmg += Math.floor(raw / 2);
            } else {
              appliedDmg += raw;
            }
          } else {
            appliedDmg += raw;
          }
        });

        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Damage';
        const resultEl = attackRow?.querySelector('.sb-row-dmg-result');

        // Apply damage to target if one is selected and the attack hit.
        // Empty/unset attackHit means no ATK roll was made (e.g. AoE), which always deals damage.
        const attackHitData = attackRow?.dataset.attackHit;
        const attackHit = !attackHitData || attackHitData === 'true';
        if (attackRow) attackRow.dataset.attackHit = '';

        let resistNote = '';
        if (targetToken && attackHit) {
          const dmgChange = changeTokenHp(targetToken.id, -appliedDmg);
          if (dmgChange) {
            renderTokens();
            if (targetToken === state.selectedToken) {
              updateTokenInfoPanel(targetToken);
            } else {
              // Refresh the target dropdown HP display
              populateTargetSelect(state.selectedToken);
            }
          }
          if (appliedDmg === 0 && totalDmg > 0) {
            resistNote = ' → 0 (IMMUNE)';
          } else if (appliedDmg < totalDmg) {
            resistNote = ` → ${appliedDmg} (RESIST)`;
          }
          const toastType = appliedDmg === 0 ? 'info' : 'warning';
          showToast(`💥 ${targetToken.name} takes ${appliedDmg} damage (${targetToken.hp}/${targetToken.maxHp} HP)`, toastType, 2500);
        }

        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(totalDmg);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' (Critical!)' + resistNote;
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, critSpan);
          } else if (resistNote) {
            const noteSpan = document.createElement('span');
            noteSpan.textContent = resistNote;
            noteSpan.style.color = 'var(--text-secondary)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, noteSpan);
          } else {
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal);
          }
          scheduleResultFade(resultEl);
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

  // Speed
  const speedEl = document.getElementById('info-speed');
  if (speedEl) {
    if (token.monsterData?.speed) {
      const full = formatSpeed(token.monsterData.speed);
      // Show only the walk speed in the compact stat; reveal full in tooltip
      const primary = full.includes(',') ? full.slice(0, full.indexOf(',')) : full;
      speedEl.textContent = primary;
      speedEl.title = full;
    } else if (token.characterData?.speed) {
      speedEl.textContent = typeof token.characterData.speed === 'number'
        ? `${token.characterData.speed} ft.`
        : token.characterData.speed;
    } else {
      speedEl.textContent = '30 ft.';
    }
  }

  // Initiative
  const initiativeEl = document.getElementById('info-initiative');
  if (initiativeEl) {
    initiativeEl.textContent = token.initiative !== null && token.initiative !== undefined
      ? token.initiative : '—';
  }

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

  // Render attacks section (monsters and characters with defined attacks)
  const attackSection = document.getElementById('token-attacks-section');
  const attackListEl = document.getElementById('token-attack-list');
  if (attackSection && attackListEl) {
    attackListEl.replaceChildren();
    let attacks = [];
    if (token.monsterData) {
      attacks = parseMonsterAttacks(token.monsterData);
    } else if (token.characterData) {
      attacks = getCharacterAttacks(token.characterData);
    }
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
        dmgBtn.dataset.damageTypes = (atk.damageTypes || []).join('|');
        const damageSummary = atk.damageDice.map((dice, i) => {
          const type = (atk.damageTypes || [])[i];
          return type ? `${dice} ${type}` : dice;
        }).join(' + ');
        dmgBtn.title = `${displayName}: ${damageSummary}`;
        const dmgLabel = document.createElement('span');
        dmgLabel.className = 'sb-atk-label';
        dmgLabel.textContent = 'DMG';
        const dmgVal = document.createElement('span');
        dmgVal.className = 'sb-atk-val';
        dmgVal.textContent = damageSummary;
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
      // Populate target dropdown with other arena tokens
      populateTargetSelect(token);
    } else {
      attackSection.classList.add('hidden');
    }
  }

  // Render condition chips
  const condGrid = document.getElementById('conditions-grid');
  if (condGrid) {
    renderConditionChips(condGrid, token);
  }

  // Render resistances/immunities (monsters only)
  const resistSection = document.getElementById('token-resistances');
  const resistContent = document.getElementById('token-resistances-content');
  if (resistSection && resistContent) {
    const m = token.monsterData;
    if (m) {
      const lines = [];
      if (m.vulnerable?.length) {
        const vals = m.vulnerable.map(v => (typeof v === 'object' ? (v.vulnerable || []).join(', ') : v)).join('; ');
        lines.push(`<span class="res-line res-vuln"><strong>VULN:</strong> ${vals}</span>`);
      }
      if (m.resist?.length) {
        const vals = m.resist.map(r => (typeof r === 'object' ? (r.resist || []).join(', ') : r)).join('; ');
        lines.push(`<span class="res-line res-resist"><strong>RESIST:</strong> ${vals}</span>`);
      }
      if (m.immune?.length) {
        const vals = m.immune.map(r => (typeof r === 'object' ? (r.immune || []).join(', ') : r)).join('; ');
        lines.push(`<span class="res-line res-immune"><strong>IMMUNE:</strong> ${vals}</span>`);
      }
      if (m.conditionImmune?.length) {
        lines.push(`<span class="res-line res-immune"><strong>COND IMMUNE:</strong> ${m.conditionImmune.join(', ')}</span>`);
      }
      if (lines.length > 0) {
        resistContent.innerHTML = lines.join('');
        resistSection.classList.remove('hidden');
      } else {
        resistSection.classList.add('hidden');
      }
    } else {
      resistSection.classList.add('hidden');
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

const SHEET_CORS_PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

function setupCharactersTab() {
  // ── Sheet link import ────────────────────────────────────
  document.getElementById('btn-import-sheet-link')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('sheet-link-status');
    const url = document.getElementById('sheet-link-url')?.value?.trim();

    if (!url) {
      showImportStatus(statusEl, '⚠️ Please paste your sheet link first.', 'error');
      return;
    }

    try {
      new URL(url);
    } catch {
      showImportStatus(statusEl, '⚠️ Invalid URL. Please paste a valid Google Sheet link.', 'error');
      return;
    }

    showImportStatus(statusEl, '⏳ Importing from sheet…', 'loading');

    const endpoints = [url, ...SHEET_CORS_PROXIES.map(fn => fn(url))];
    let charData = null;

    for (let i = 0; i < endpoints.length; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(endpoints[i], { signal: controller.signal, mode: 'cors' });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        charData = parseGSheetJSON(text);
        break;
      } catch {
        // Try next endpoint
      }
    }

    if (charData) {
      state.characters.push(charData);
      renderCharacterList();
      showImportStatus(statusEl, `✅ Imported ${charData.name}!`, 'success');
      const input = document.getElementById('sheet-link-url');
      if (input) input.value = '';
    } else {
      showImportStatus(statusEl, '⚠️ Could not import from that link. Make sure your sheet is published and returns character JSON.', 'error');
    }
  });

  // ── Add character from character list to arena ──────────
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

// ─── Character Sheet Overlay ──────────────────────────────────────────────────

let pendingCharId = null;

function setupCharacterSheetOverlay() {
  document.getElementById('charsheet-close')?.addEventListener('click', closeCharSheet);
  document.getElementById('btn-close-charsheet')?.addEventListener('click', closeCharSheet);
  document.querySelector('#charsheet-overlay .overlay-backdrop')?.addEventListener('click', closeCharSheet);

  document.getElementById('btn-charsheet-to-arena')?.addEventListener('click', () => {
    if (!pendingCharId) return;
    const char = state.characters.find(c => c.id === pendingCharId);
    if (!char) return;

    const tokenOnGrid = state.tokens.find(t => t.characterData?.id === char.id || t.id === char.tokenId);
    if (tokenOnGrid) {
      showToast(`🧙 ${char.name} is already on the grid!`, 'info');
      closeCharSheet();
      switchTab('arena');
      return;
    }

    const token = createCharacterToken(char);
    char.tokenId = token.id;
    const placed = addTokenToGrid(token);
    if (!placed) {
      showToast('⚠️ Arena is full!', 'warning');
      return;
    }
    renderCharacterList();
    closeCharSheet();
    showToast(`🧙 ${char.name} added to arena!`, 'success');
    switchTab('arena');
  });

  // Wire up roll buttons inside the character sheet overlay (event delegation)
  const bodyEl = document.getElementById('charsheet-body');
  if (bodyEl) {
    bodyEl.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('.sb-save-throw-btn');
      if (saveBtn) {
        const ability = saveBtn.dataset.ability;
        const mod = parseInt(saveBtn.dataset.mod, 10);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const total = d20 + mod;
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
        const label = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[ability] || ability;
        const resultEl = bodyEl.querySelector('.sb-saving-throw-result');
        if (resultEl) {
          const boldLabel = document.createElement('strong');
          boldLabel.textContent = label;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(total);
          resultEl.replaceChildren(`🎲 `, boldLabel, ` Save: d20(${d20})${modStr} = `, boldTotal);
        }
        return;
      }

      const skillBtn = e.target.closest('.sb-skill-check');
      if (skillBtn) {
        const check = skillBtn.dataset.check;
        const mod = parseInt(skillBtn.dataset.mod, 10);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const total = d20 + mod;
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
        const label = { perception: 'Perception', stealth: 'Stealth', spellcasting: 'Spellcasting' }[check] || check;
        const resultEl = bodyEl.querySelector('.sb-skill-result');
        if (resultEl) {
          const boldLabel = document.createElement('strong');
          boldLabel.textContent = label;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(total);
          resultEl.replaceChildren(`🎯 `, boldLabel, `: d20(${d20})${modStr} = `, boldTotal);
        }
        return;
      }

      const atkBtn = e.target.closest('.sb-atk-roll-btn');
      if (atkBtn) {
        const bonus = parseInt(atkBtn.dataset.bonus, 10);
        const d20 = Math.floor(Math.random() * 20) + 1;
        const isCrit = d20 === 20;
        const attackRow = atkBtn.closest('.sb-attack-row');
        if (attackRow) attackRow.dataset.critical = isCrit ? 'true' : '';
        const total = d20 + bonus;
        const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Attack';
        const resultEl = attackRow?.querySelector('.sb-row-atk-result');
        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(total);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' CRITICAL HIT!';
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal, critSpan);
          } else {
            resultEl.replaceChildren(`⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal);
          }
        }
        return;
      }

      const dmgBtn = e.target.closest('.sb-dmg-roll-btn');
      if (dmgBtn) {
        const attackRow = dmgBtn.closest('.sb-attack-row');
        const isCrit = attackRow?.dataset.critical === 'true';
        if (attackRow) attackRow.dataset.critical = '';
        const damageParts = dmgBtn.dataset.damage.split('|');
        const damageTypesParts = (dmgBtn.dataset.damageTypes || '').split('|');

        const targetToken = getSelectedTargetToken();
        const m = targetToken?.monsterData;
        const resistTypes = m ? flattenDamageTypes(m.resist, 'resist') : [];
        const immuneTypes = m ? flattenDamageTypes(m.immune, 'immune') : [];

        let totalDmg = 0;
        let appliedDmg = 0;
        const rolls = [];
        damageParts.forEach((dice, idx) => {
          const effectiveDice = isCrit ? doubleDiceNotation(dice) : dice;
          const result = rollDice(effectiveDice);
          totalDmg += result;
          const dmgType = (damageTypesParts[idx] || '').toLowerCase();
          rolls.push(dmgType ? `${effectiveDice}(${result}) ${dmgType}` : `${effectiveDice}(${result})`);

          if (targetToken) {
            if (dmgType && immuneTypes.includes(dmgType)) {
              // immune: contributes 0
            } else if (dmgType && resistTypes.includes(dmgType)) {
              appliedDmg += Math.floor(result / 2);
            } else {
              appliedDmg += result;
            }
          } else {
            appliedDmg += result;
          }
        });

        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Damage';
        const resultEl = attackRow?.querySelector('.sb-row-dmg-result');

        const attackHitData = attackRow?.dataset.attackHit;
        const attackHit = !attackHitData || attackHitData === 'true';
        if (attackRow) attackRow.dataset.attackHit = '';

        let resistNote = '';
        if (targetToken && attackHit) {
          const dmgChange = changeTokenHp(targetToken.id, -appliedDmg);
          if (dmgChange) {
            renderTokens();
            if (targetToken === state.selectedToken) {
              updateTokenInfoPanel(targetToken);
            } else if (state.selectedToken) {
              populateTargetSelect(state.selectedToken);
            }
          }
          if (appliedDmg === 0 && totalDmg > 0) {
            resistNote = ' → 0 (IMMUNE)';
          } else if (appliedDmg < totalDmg) {
            resistNote = ` → ${appliedDmg} (RESIST)`;
          }
          const toastType = appliedDmg === 0 ? 'info' : 'warning';
          showToast(`💥 ${targetToken.name} takes ${appliedDmg} damage (${targetToken.hp}/${targetToken.maxHp} HP)`, toastType, 2500);
        }

        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(totalDmg);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' (Critical!)' + resistNote;
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, critSpan);
          } else if (resistNote) {
            const noteSpan = document.createElement('span');
            noteSpan.textContent = resistNote;
            noteSpan.style.color = 'var(--text-secondary)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, noteSpan);
          } else {
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal);
          }
          scheduleResultFade(resultEl);
        }
      }
    });
  }

  // Handle viewCharSheet events from character list cards
  document.addEventListener('viewCharSheet', (e) => {
    const char = state.characters.find(c => c.id === e.detail.charId);
    if (!char) return;
    openCharSheet(char);
  });
}

function openCharSheet(char) {
  const overlay = document.getElementById('charsheet-overlay');
  const nameEl = document.getElementById('charsheet-name');
  const bodyEl = document.getElementById('charsheet-body');
  const toArenaBtn = document.getElementById('btn-charsheet-to-arena');
  if (!overlay || !nameEl || !bodyEl) return;

  pendingCharId = char.id;
  nameEl.textContent = char.name;
  bodyEl.innerHTML = parseCharacterStatblock(char);

  // Update "Add to Arena" button state
  const tokenOnGrid = state.tokens.find(t => t.characterData?.id === char.id || t.id === char.tokenId);
  if (toArenaBtn) {
    if (tokenOnGrid) {
      toArenaBtn.textContent = '✅ On Grid';
      toArenaBtn.disabled = true;
    } else {
      toArenaBtn.textContent = '⚔️ Add to Arena';
      toArenaBtn.disabled = false;
    }
  }

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCharSheet() {
  const overlay = document.getElementById('charsheet-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
  pendingCharId = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function switchTab(tabName) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (btn) btn.click();
}

/** Show an import status message in a status element */
function showImportStatus(el, message, type) {
  if (!el) return;
  el.className = `import-status import-status-${type}`;
  el.innerHTML = message;
  el.classList.remove('hidden');
}

/** All standard D&D 5e conditions */
const CONDITIONS = [
  'Blinded', 'Charmed', 'Deafened', 'Exhausted', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned',
  'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

/**
 * Render condition toggle chips into a container element.
 * @param {HTMLElement} container
 * @param {Object} token
 */
function renderConditionChips(container, token) {
  container.replaceChildren();
  const active = Array.isArray(token.conditions) ? token.conditions : [];
  CONDITIONS.forEach(condition => {
    const chip = document.createElement('button');
    const key = condition.toLowerCase();
    chip.className = 'condition-chip' + (active.includes(key) ? ' active' : '');
    chip.textContent = condition;
    chip.dataset.condition = key;
    chip.title = condition;
    chip.type = 'button';
    container.appendChild(chip);
  });
}

/** Double the number of dice in a notation string for critical hits */
function doubleDiceNotation(notation) {
  const str = String(notation).trim().toLowerCase().replace(/\s/g, '');
  const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return notation;
  return `${parseInt(match[1]) * 2}d${match[2]}${match[3] || ''}`;
}

/**
 * Populate the target dropdown with all arena tokens except the current attacker.
 * @param {Object} currentToken - The attacker token
 */
function populateTargetSelect(currentToken) {
  const select = document.getElementById('target-token-select');
  if (!select) return;
  const prevValue = select.value;
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '— none —';
  select.appendChild(none);
  for (const token of state.tokens) {
    if (token.id === currentToken.id) continue;
    const opt = document.createElement('option');
    opt.value = token.id;
    opt.textContent = `${token.name} (${token.hp}/${token.maxHp} HP)`;
    select.appendChild(opt);
  }
  // Restore previous selection if still valid
  if (prevValue && Array.from(select.options).some(o => o.value === prevValue)) {
    select.value = prevValue;
  }
}

/**
 * Return the currently selected target token (or null if none selected).
 * @returns {Object|null}
 */
function getSelectedTargetToken() {
  const select = document.getElementById('target-token-select');
  if (!select || !select.value) return null;
  return findToken(select.value) || null;
}

/**
 * Extract flat damage type strings from a token's monsterData resist/immune arrays.
 * @param {Array} arr - e.g. ['fire', {resist:['bludgeoning'], note:'...'}]
 * @param {string} propertyName - 'resist' or 'immune'
 * @returns {string[]}
 */
function flattenDamageTypes(arr, propertyName) {
  if (!Array.isArray(arr)) return [];
  const types = [];
  for (const entry of arr) {
    if (typeof entry === 'string') {
      types.push(entry.toLowerCase());
    } else if (typeof entry === 'object' && entry !== null) {
      const inner = entry[propertyName];
      if (Array.isArray(inner)) {
        inner.forEach(t => types.push(String(t).toLowerCase()));
      }
    }
  }
  return types;
}
