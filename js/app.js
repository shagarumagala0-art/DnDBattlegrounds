/**
 * DnD Arena Pro — Main Application Module
 */

import { state, changeTokenHp, setTokenHp, findToken } from './state.js';
import {
  initGrid, addTokenToGrid, removeTokenFromGrid, renderTokens,
  deselectToken, clearGrid, onTokenSelect, onTokenDeselect
} from './grid.js';
import { loadBestiaries, searchMonsters, renderMonsterList, closeStatblock, openAddToArenaModal, createMonsterToken, parseMonsterAttacks, cleanActionName } from './monsters.js';
import { importCharacter, createCharacterToken, createManualCharacter, renderCharacterList, getCharacterAttacks, parseCharacterStatblock } from './dicecloud.js';
import { parseDnDBeyondJSON, parseGSheetJSON, readJSONFile } from './import.js';
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
  setupCharacterSheetOverlay();

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

  // Schedule a result element to fade out after 2 seconds and then clear its content
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
        let totalDmg = 0;
        const rolls = [];
        damageParts.forEach(dice => {
          const effectiveDice = isCrit ? doubleDiceNotation(dice) : dice;
          const result = rollDice(effectiveDice);
          totalDmg += result;
          rolls.push(`${effectiveDice}(${result})`);
        });
        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Damage';
        const resultEl = attackRow?.querySelector('.sb-row-dmg-result');
        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(totalDmg);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' (Critical!)';
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, critSpan);
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
  // ── Import source tab switching ─────────────────────────
  document.querySelectorAll('.import-source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const source = btn.dataset.source;
      document.querySelectorAll('.import-source-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.import-source-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`import-panel-${source}`)?.classList.add('active');
    });
  });

  // ── DiceCloud import ────────────────────────────────────
  document.getElementById('btn-import-character')?.addEventListener('click', async () => {
    const url = document.getElementById('dicecloud-url')?.value || '';
    const charData = await importCharacter(url);
    if (charData) {
      state.characters.push(charData);
      renderCharacterList();
    }
  });

  // ── D&D Beyond file import ──────────────────────────────
  const ddbFileInput = document.getElementById('dndbeyond-file');
  ddbFileInput?.addEventListener('change', () => {
    const name = ddbFileInput.files?.[0]?.name || 'Choose JSON file…';
    const el = document.getElementById('dndbeyond-file-name');
    if (el) el.textContent = name;
  });

  document.getElementById('btn-import-dndbeyond')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('dndbeyond-status');
    const file = ddbFileInput?.files?.[0];
    if (!file) {
      showImportStatus(statusEl, '⚠️ Please choose a JSON file first.', 'error');
      return;
    }
    showImportStatus(statusEl, '⏳ Reading file…', 'loading');
    try {
      const raw = await readJSONFile(file);
      const charData = parseDnDBeyondJSON(raw);
      state.characters.push(charData);
      renderCharacterList();
      showImportStatus(statusEl, `✅ Imported ${charData.name} from D&D Beyond!`, 'success');
      if (ddbFileInput) ddbFileInput.value = '';
      const nameEl = document.getElementById('dndbeyond-file-name');
      if (nameEl) nameEl.textContent = 'Choose JSON file…';
    } catch (err) {
      showImportStatus(statusEl, `⚠️ Import failed: ${err.message}`, 'error');
    }
  });

  // ── G-sheet help toggle ─────────────────────────────────
  document.getElementById('gsheet-help-toggle')?.addEventListener('click', (e) => {
    e.preventDefault();
    const help = document.getElementById('gsheet-help');
    const toggle = document.getElementById('gsheet-help-toggle');
    if (help) {
      const hidden = help.classList.toggle('hidden');
      if (toggle) toggle.textContent = hidden ? 'How to export ▾' : 'How to export ▴';
    }
  });

  // ── G-sheet file upload ─────────────────────────────────
  const gsheetFileInput = document.getElementById('gsheet-file');
  gsheetFileInput?.addEventListener('change', () => {
    const name = gsheetFileInput.files?.[0]?.name || 'Choose JSON file…';
    const el = document.getElementById('gsheet-file-name');
    if (el) el.textContent = name;
  });

  document.getElementById('btn-import-gsheet-file')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('gsheet-status');
    const file = gsheetFileInput?.files?.[0];
    if (!file) {
      showImportStatus(statusEl, '⚠️ Please choose a JSON file first.', 'error');
      return;
    }
    showImportStatus(statusEl, '⏳ Reading file…', 'loading');
    try {
      const raw = await readJSONFile(file);
      const charData = parseGSheetJSON(raw);
      state.characters.push(charData);
      renderCharacterList();
      showImportStatus(statusEl, `✅ Imported ${charData.name} from G-Sheet!`, 'success');
      if (gsheetFileInput) gsheetFileInput.value = '';
      const nameEl = document.getElementById('gsheet-file-name');
      if (nameEl) nameEl.textContent = 'Choose JSON file…';
    } catch (err) {
      showImportStatus(statusEl, `⚠️ Import failed: ${err.message}`, 'error');
    }
  });

  // ── G-sheet JSON paste import ───────────────────────────
  document.getElementById('btn-import-gsheet')?.addEventListener('click', () => {
    const statusEl = document.getElementById('gsheet-status');
    const json = document.getElementById('gsheet-json')?.value?.trim();
    if (!json) {
      showImportStatus(statusEl, '⚠️ Please paste your character JSON first.', 'error');
      return;
    }
    try {
      const charData = parseGSheetJSON(json);
      state.characters.push(charData);
      renderCharacterList();
      showImportStatus(statusEl, `✅ Imported ${charData.name} from G-Sheet JSON!`, 'success');
      const jsonEl = document.getElementById('gsheet-json');
      if (jsonEl) jsonEl.value = '';
    } catch (err) {
      showImportStatus(statusEl, `⚠️ Import failed: ${err.message}`, 'error');
    }
  });

  // ── Custom attack rows ──────────────────────────────────
  document.getElementById('btn-add-attack-row')?.addEventListener('click', () => {
    addCustomAttackRow();
  });

  // ── Custom player form ──────────────────────────────────
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

    // Collect attacks from custom attack rows
    const attacks = collectCustomAttacks();

    const formData = {
      name,
      hp,
      ac,
      class: document.getElementById('player-class')?.value?.trim() || 'Adventurer',
      level: parseInt(document.getElementById('player-level')?.value) || 1,
      str: parseInt(document.getElementById('player-str')?.value) || 10,
      dex: parseInt(document.getElementById('player-dex')?.value) || 10,
      con: parseInt(document.getElementById('player-con')?.value) || 10,
      int: parseInt(document.getElementById('player-int')?.value) || 10,
      wis: parseInt(document.getElementById('player-wis')?.value) || 10,
      cha: parseInt(document.getElementById('player-cha')?.value) || 10,
      attacks,
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
    // Clear form
    ['player-name', 'player-class'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['player-hp', 'player-ac'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const levelEl = document.getElementById('player-level');
    if (levelEl) levelEl.value = '1';
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(s => {
      const el = document.getElementById(`player-${s}`);
      if (el) el.value = '10';
    });
    // Clear attack rows
    const attackRows = document.getElementById('custom-attack-rows');
    if (attackRows) attackRows.innerHTML = '';

    showToast(`🧙 ${charData.name} added to arena!`, 'success');
    switchTab('arena');
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
        let totalDmg = 0;
        const rolls = [];
        damageParts.forEach(dice => {
          const effectiveDice = isCrit ? doubleDiceNotation(dice) : dice;
          const result = rollDice(effectiveDice);
          totalDmg += result;
          rolls.push(`${effectiveDice}(${result})`);
        });
        const name = attackRow?.querySelector('.sb-attack-name')?.textContent || 'Damage';
        const resultEl = attackRow?.querySelector('.sb-row-dmg-result');
        if (resultEl) {
          const boldName = document.createElement('strong');
          boldName.textContent = name;
          const boldTotal = document.createElement('strong');
          boldTotal.textContent = String(totalDmg);
          if (isCrit) {
            const critSpan = document.createElement('span');
            critSpan.textContent = ' (Critical!)';
            critSpan.style.color = 'var(--gold-accent, gold)';
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal, critSpan);
          } else {
            resultEl.replaceChildren(`💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal);
          }
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

/** Add a new attack row to the custom player form */
function addCustomAttackRow() {
  const container = document.getElementById('custom-attack-rows');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'custom-attack-row';
  row.innerHTML = `
    <input type="text" class="text-input atk-name" placeholder="Attack name" autocomplete="off">
    <input type="text" class="text-input atk-bonus" placeholder="+5" style="width:60px">
    <input type="text" class="text-input atk-damage" placeholder="1d8+3" style="width:80px">
    <button class="btn btn-sm btn-danger atk-remove" type="button" title="Remove attack">✕</button>
  `;
  row.querySelector('.atk-remove')?.addEventListener('click', () => row.remove());
  container.appendChild(row);
}

/** Collect attacks from the custom attack rows */
function collectCustomAttacks() {
  const rows = document.querySelectorAll('#custom-attack-rows .custom-attack-row');
  const attacks = [];
  rows.forEach(row => {
    const name = row.querySelector('.atk-name')?.value?.trim();
    const bonusRaw = row.querySelector('.atk-bonus')?.value?.trim() || '0';
    const damage = row.querySelector('.atk-damage')?.value?.trim() || '1d4';
    if (!name) return;
    const hitBonus = parseInt(bonusRaw.replace(/^\+/, '')) || 0;
    attacks.push({ name, hitBonus, damageDice: [damage], isAoe: false });
  });
  return attacks;
}

/** Double the number of dice in a notation string for critical hits */
function doubleDiceNotation(notation) {
  const str = String(notation).trim().toLowerCase().replace(/\s/g, '');
  const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return notation;
  return `${parseInt(match[1]) * 2}d${match[2]}${match[3] || ''}`;
}
