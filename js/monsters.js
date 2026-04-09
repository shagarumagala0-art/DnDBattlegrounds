import { state } from './state.js';
import { BESTIARY_DATA } from '../data/bestiary-data.js';
import {
  parse5etools, parseCR, formatCR, getAverageHp, getAcValue,
  getModifier, formatModifier, getMonsterType, generateId, getAbbr,
  rollDice, showToast, formatSpeed, formatAlignment, formatSize,
  getSpellcastingModifier
} from './utils.js';

/** All six D&D saving throw abilities, ordered for display. */
const SAVE_ABILITIES = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

/** Maps ability keys to their display labels. */
const SAVE_LABEL_MAP = Object.fromEntries(SAVE_ABILITIES.map(({ key, label }) => [key, label]));

/** Maps skill check keys to their display labels. */
const SKILL_CHECK_LABELS = { perception: 'Perception', stealth: 'Stealth', spellcasting: 'Spellcasting' };

/** List of all bestiary JSON files in the /data/ directory. */
const BESTIARY_FILES = [
  'bestiary-basic.json',
  'bestiary-ftd.json',
  'bestiary-mpmm.json',
];

/** Spell lookup map populated by loadSpells(). Keys are normalised lowercase names. */
const spellLookup = {};

/**
 * Load spell details from /data/spells.json and populate spellLookup.
 */
export async function loadSpells() {
  try {
    const response = await fetch('./data/spells.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    for (const spell of (data.spell || [])) {
      spellLookup[spell.name.toLowerCase()] = spell;
    }
  } catch (err) {
    console.warn('Could not load spells.json:', err.message);
  }
}

/**
 * Load all bestiary JSON files from the /data/ directory and populate
 * state.monsters with the combined, deduplicated monster list.
 * Starts with the hardcoded BESTIARY_DATA as a reliable base, then
 * supplements with additional monsters fetched from the JSON files.
 */
export async function loadBestiaries() {
  // Start with the hardcoded bestiary data that is always available
  const allMonsters = [...(BESTIARY_DATA.monster || [])];

  for (const filename of BESTIARY_FILES) {
    try {
      const response = await fetch(`./data/${filename}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const monsters = data.monster || [];
      allMonsters.push(...monsters);
    } catch (err) {
      // File not found or other fetch error — skip silently
      console.warn(`Could not load ${filename}:`, err.message);
    }
  }

  if (allMonsters.length > 0) {
    // Deduplicate by name (keep first occurrence)
    const seen = new Set();
    state.monsters = allMonsters.filter(m => {
      if (seen.has(m.name)) return false;
      seen.add(m.name);
      return true;
    });
    showToast(`📚 Loaded ${state.monsters.length} monsters`, 'success', 2000);
  } else {
    console.warn('Could not load any bestiary data.');
    state.monsters = [];
    showToast('⚠️ Could not load monster data', 'error');
  }
}

/**
 * Search/filter monsters
 * @param {string} query - Name search
 * @param {string} crFilter - CR value filter (empty = all)
 * @param {string} typeFilter - Type filter (empty = all)
 * @returns {Array}
 */
export function searchMonsters(query, crFilter, typeFilter) {
  let results = state.monsters;

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    results = results.filter(m => m.name.toLowerCase().includes(q));
  }

  if (crFilter !== '' && crFilter !== undefined && crFilter !== null) {
    const targetCr = parseFloat(crFilter);
    if (!isNaN(targetCr)) {
      if (targetCr >= 11) {
        results = results.filter(m => parseCR(m.cr) >= 11);
      } else {
        results = results.filter(m => Math.abs(parseCR(m.cr) - targetCr) < 0.01);
      }
    }
  }

  if (typeFilter && typeFilter.trim()) {
    const type = typeFilter.trim().toLowerCase();
    results = results.filter(m => getMonsterType(m.type).toLowerCase() === type);
  }

  // Sort by CR then name
  results = [...results].sort((a, b) => {
    const crDiff = parseCR(a.cr) - parseCR(b.cr);
    return crDiff !== 0 ? crDiff : a.name.localeCompare(b.name);
  });

  return results;
}

/**
 * Render the monster list into the results container
 * @param {Array} monsters
 */
export function renderMonsterList(monsters) {
  const container = document.getElementById('monster-results');
  if (!container) return;

  if (!monsters || monsters.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🐉</div>
        <p>No monsters found.</p>
        <p class="empty-hint">Try a different search or filter.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  monsters.forEach(monster => {
    const card = document.createElement('div');
    card.className = 'monster-card';
    card.dataset.monsterId = monster.name;

    const hp = getAverageHp(monster.hp);
    const ac = getAcValue(monster.ac);
    const cr = formatCR(monster.cr);
    const type = getMonsterType(monster.type);
    const size = formatSize(monster.size);

    card.innerHTML = `
      <div class="monster-card-main">
        <div class="monster-card-name">${monster.name}</div>
        <div class="monster-card-type">${size} ${type}</div>
      </div>
      <div class="monster-card-stats">
        <div class="monster-stat">
          <span class="monster-stat-label">HP</span>
          <span class="monster-stat-val">${hp}</span>
        </div>
        <div class="monster-stat">
          <span class="monster-stat-label">AC</span>
          <span class="monster-stat-val">${ac}</span>
        </div>
        <div class="monster-stat">
          <span class="monster-stat-label">CR</span>
          <span class="monster-stat-val cr-badge cr-${getCrTier(parseCR(monster.cr))}">${cr}</span>
        </div>
      </div>
      <div class="monster-card-actions">
        <button class="btn btn-sm btn-gold" data-action="view" data-name="${monster.name}">📖 View</button>
        <button class="btn btn-sm btn-primary" data-action="add" data-name="${monster.name}">⚔️ Add</button>
      </div>
    `;

    card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
      e.stopPropagation();
      showStatblock(monster);
    });
    card.querySelector('[data-action="add"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openAddToArenaModal(monster);
    });

    container.appendChild(card);
  });
}

/**
 * Get CR tier string for CSS classes
 */
function getCrTier(cr) {
  if (cr <= 0.25) return 'low';
  if (cr <= 2) return 'medium';
  if (cr <= 7) return 'high';
  return 'deadly';
}

/**
 * Show the statblock overlay for a monster
 * @param {Object} monster
 */
export function showStatblock(monster) {
  const overlay = document.getElementById('statblock-overlay');
  const nameEl = document.getElementById('statblock-name');
  const bodyEl = document.getElementById('statblock-body');
  const addBtn = document.getElementById('btn-add-to-arena');

  if (!overlay || !nameEl || !bodyEl) return;

  nameEl.textContent = monster.name;
  bodyEl.innerHTML = parseStatblock(monster);

  // Wire up saving throw roll buttons
  const saveResultEl = bodyEl.querySelector('.sb-saving-throw-result');
  bodyEl.querySelectorAll('.sb-save-throw-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ability = btn.dataset.ability;
      const mod = parseInt(btn.dataset.mod, 10);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + mod;
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      const label = SAVE_LABEL_MAP[ability];
      if (saveResultEl && label) {
        // Build result using DOM manipulation to avoid innerHTML with interpolated values
        const boldLabel = document.createElement('strong');
        boldLabel.textContent = label;
        const boldTotal = document.createElement('strong');
        boldTotal.textContent = String(total);
        saveResultEl.replaceChildren(
          `🎲 `, boldLabel, ` Save: d20(${d20})${modStr} = `, boldTotal
        );
      }
    });
  });

  // Wire up skill check roll buttons
  const skillResultEl = bodyEl.querySelector('.sb-skill-result');
  bodyEl.querySelectorAll('.sb-skill-check').forEach(btn => {
    btn.addEventListener('click', () => {
      const check = btn.dataset.check;
      const mod = parseInt(btn.dataset.mod, 10);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + mod;
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      const label = SKILL_CHECK_LABELS[check];
      if (skillResultEl && label) {
        const boldLabel = document.createElement('strong');
        boldLabel.textContent = label;
        const boldTotal = document.createElement('strong');
        boldTotal.textContent = String(total);
        skillResultEl.replaceChildren(
          `🎯 `, boldLabel, `: d20(${d20})${modStr} = `, boldTotal
        );
      }
    });
  });

  // Wire up attack roll buttons — result displayed in the row's own ATK result line
  bodyEl.querySelectorAll('.sb-atk-roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const bonus = parseInt(btn.dataset.bonus, 10);
      const d20 = Math.floor(Math.random() * 20) + 1;
      const total = d20 + bonus;
      const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
      const name = btn.closest('.sb-attack-row')?.querySelector('.sb-attack-name')?.textContent || 'Attack';
      const resultEl = btn.closest('.sb-attack-row')?.querySelector('.sb-row-atk-result');
      if (resultEl) {
        const boldName = document.createElement('strong');
        boldName.textContent = name;
        const boldTotal = document.createElement('strong');
        boldTotal.textContent = String(total);
        resultEl.replaceChildren(
          `⚔️ `, boldName, `: d20(${d20})${bonusStr} = `, boldTotal
        );
      }
    });
  });

  // Wire up damage roll buttons — result displayed in the row's own DMG result line
  bodyEl.querySelectorAll('.sb-dmg-roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const damageParts = btn.dataset.damage.split('|');
      const damageTypesParts = (btn.dataset.damageTypes || '').split('|');
      let totalDmg = 0;
      const rolls = [];
      damageParts.forEach((dice, idx) => {
        const result = rollDice(dice);
        totalDmg += result;
        const dmgType = (damageTypesParts[idx] || '').toLowerCase();
        rolls.push(dmgType ? `${dice}(${result}) ${dmgType}` : `${dice}(${result})`);
      });
      const name = btn.closest('.sb-attack-row')?.querySelector('.sb-attack-name')?.textContent || 'Damage';
      const resultEl = btn.closest('.sb-attack-row')?.querySelector('.sb-row-dmg-result');
      if (resultEl) {
        const boldName = document.createElement('strong');
        boldName.textContent = name;
        const boldTotal = document.createElement('strong');
        boldTotal.textContent = String(totalDmg);
        resultEl.replaceChildren(
          `💥 `, boldName, `: ${rolls.join(' + ')} = `, boldTotal
        );
      }
    });
  });

  state.pendingMonster = monster;

  if (addBtn) {
    addBtn.onclick = () => {
      overlay.classList.add('hidden');
      openAddToArenaModal(monster);
    };
  }

  overlay.classList.remove('hidden');
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

/**
 * Close the statblock overlay
 */
export function closeStatblock() {
  const overlay = document.getElementById('statblock-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

/**
 * Open the "Add to Arena" modal for a specific monster
 * @param {Object} monster
 */
export function openAddToArenaModal(monster) {
  const modal = document.getElementById('add-to-arena-modal');
  const nameEl = document.getElementById('modal-monster-name');
  const hpInput = document.getElementById('modal-hp');

  if (!modal) return;

  state.pendingMonster = monster;
  if (nameEl) nameEl.textContent = monster.name;
  if (hpInput) {
    hpInput.placeholder = `Default (${getAverageHp(monster.hp)})`;
    hpInput.value = '';
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

/**
 * Get a monster's saving throw bonus for an ability.
 * Prefers the explicit save modifier from monster.save when available,
 * otherwise falls back to the raw ability modifier.
 *
 * @param {Object} monster
 * @param {string} ability - 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
 * @returns {number}
 */
function getMonsterSaveBonus(monster, ability) {
  if (monster.save && monster.save[ability] !== undefined && monster.save[ability] !== null) {
    const parsed = parseInt(monster.save[ability], 10);
    if (!isNaN(parsed)) return parsed;
    console.warn(`[statblock] Could not parse save bonus for ${ability}: "${monster.save[ability]}"; using ability modifier instead.`);
  }
  return getModifier(monster[ability] || 10);
}

/**
 * Recursively extract all plain-text content from a 5etools-style entries array,
 * including nested objects with their own entries/items arrays (e.g. list items
 * inside a breath-weapon action).
 *
 * @param {Array} entries
 * @returns {string}
 */
function extractEntryText(entries) {
  if (!Array.isArray(entries)) return '';
  return entries.map(e => {
    if (typeof e === 'string') return e;
    if (e && typeof e === 'object') {
      const parts = [];
      if (Array.isArray(e.entries)) parts.push(extractEntryText(e.entries));
      if (Array.isArray(e.items)) parts.push(extractEntryText(e.items));
      return parts.join(' ');
    }
    return '';
  }).join(' ');
}

/** Maps full ability name (as found in action text) to the short key used elsewhere. */
const SAVE_ABILITY_NAME_MAP = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

/**
 * Extract attack information from a monster's action list.
 * Actions with {@hit N} get an attack roll + damage roll.
 * Actions with {@damage} but no {@hit} (AOE / save-based) get damage roll only.
 * For AOE actions, the first {@dc N} found in the action text is captured as saveDc,
 * and the ability name immediately following (e.g. "Dexterity saving throw") is
 * captured as saveAbility (short form: 'str', 'dex', 'con', 'int', 'wis', 'cha').
 *
 * @param {Object} monster
 * @returns {Array<{name: string, isAoe: boolean, hitBonus: number|null, saveDc: number|null, saveAbility: string|null, damageDice: string[], damageTypes: string[]}>}
 */
export function parseMonsterAttacks(monster) {
  const attacks = [];
  if (!monster.action) return attacks;

  for (const action of monster.action) {
    const entries = action.entries || [];
    const fullText = entries.filter(e => typeof e === 'string').join(' ');
    if (!fullText) continue;

    const hitMatch = fullText.match(/\{@hit\s+(-?\d+)\}/);
    // In 5etools format, the damage type word follows the {@damage} tag,
    // sometimes separated by a closing paren and/or space, e.g.:
    //   "{@damage 1d6+2} piercing damage"   → captures "piercing"
    //   "({@damage 2d10 + 7}) piercing damage" → captures "piercing"
    const damageWithTypeMatches = [...fullText.matchAll(/\{@damage\s+([^}]+)\}[^a-zA-Z]*([a-zA-Z]+)?/g)];

    if (damageWithTypeMatches.length === 0) continue;

    const damageDice = damageWithTypeMatches.map(m => m[1].trim().replace(/\s/g, ''));
    const damageTypes = damageWithTypeMatches.map(m => (m[2] || '').toLowerCase());

    if (hitMatch) {
      attacks.push({
        name: action.name,
        isAoe: false,
        hitBonus: parseInt(hitMatch[1], 10),
        saveDc: null,
        saveAbility: null,
        damageDice,
        damageTypes,
      });
    } else {
      // Search the full nested text for a saving throw DC and ability
      const allText = extractEntryText(entries);
      // Try to match "{@dc N} AbilityName saving throw" to capture both DC and ability
      const dcAbilityMatch = allText.match(/\{@dc\s+(\d+)\}\s+(\w+)\s+saving throw/i);
      const dcOnlyMatch = dcAbilityMatch ? null : allText.match(/\{@dc\s+(\d+)\}/);
      const saveDc = dcAbilityMatch
        ? parseInt(dcAbilityMatch[1], 10)
        : (dcOnlyMatch ? parseInt(dcOnlyMatch[1], 10) : null);
      const saveAbility = dcAbilityMatch
        ? (SAVE_ABILITY_NAME_MAP[dcAbilityMatch[2].toLowerCase()] || null)
        : null;
      attacks.push({
        name: action.name,
        isAoe: true,
        hitBonus: null,
        saveDc,
        saveAbility,
        damageDice,
        damageTypes,
      });
    }
  }

  return attacks;
}

/**
 * Map school abbreviation to full school name.
 * @param {string} abbr
 * @returns {string}
 */
function getSchoolName(abbr) {
  const schools = {
    A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment',
    I: 'Illusion', N: 'Necromancy', T: 'Transmutation', V: 'Evocation',
  };
  return schools[abbr] || abbr;
}

/**
 * Extract a flat list of spells a monster can cast from its spellcasting entries.
 * Returns an array of objects: { spellName, frequency, detail, spellData }
 * where frequency is 'at will', '1/day', '2/day', '3/day', etc.
 *
 * @param {Object} monster
 * @returns {Array<{spellName: string, frequency: string, detail: string, spellData: Object|null}>}
 */
export function parseMonsterSpells(monster) {
  const result = [];
  if (!monster.spellcasting) return result;

  for (const sc of monster.spellcasting) {
    // At-will spells
    if (sc.will) {
      for (const entry of sc.will) {
        const { name, detail } = extractSpellName(entry);
        result.push({ spellName: name, frequency: 'at will', detail, spellData: spellLookup[name.toLowerCase()] || null });
      }
    }
    // Daily / limited-use spells
    if (sc.daily) {
      for (const [key, entries] of Object.entries(sc.daily)) {
        // Key examples: "1e", "2e", "3e" (each), "1", "2", "3" (shared)
        const count = parseInt(key, 10);
        const frequency = `${count}/day`;
        for (const entry of entries) {
          const { name, detail } = extractSpellName(entry);
          result.push({ spellName: name, frequency, detail, spellData: spellLookup[name.toLowerCase()] || null });
        }
      }
    }
    // Slot-based spells (headerEntries list format)
    if (sc.spells) {
      for (const [levelKey, slotEntry] of Object.entries(sc.spells)) {
        const level = parseInt(levelKey, 10);
        const spells = slotEntry.spells || [];
        const slots = slotEntry.slots !== undefined ? ` (${slotEntry.slots} slot${slotEntry.slots !== 1 ? 's' : ''})` : '';
        const frequency = level === 0 ? 'at will' : `level ${level}${slots}`;
        for (const entry of spells) {
          const { name, detail } = extractSpellName(entry);
          result.push({ spellName: name, frequency, detail, spellData: spellLookup[name.toLowerCase()] || null });
        }
      }
    }
  }

  return result;
}

/**
 * Extract a clean spell name and any parenthetical detail from a 5etools spell entry string.
 * e.g. "{@spell charm person} (as 5th-level spell)" → { name: "Charm Person", detail: "(as 5th-level spell)" }
 * @param {string} entry
 * @returns {{ name: string, detail: string }}
 */
function extractSpellName(entry) {
  if (typeof entry !== 'string') return { name: String(entry), detail: '' };
  const match = entry.match(/\{@spell\s+([^|}]+)(?:\|[^}]*)?\}/i);
  let name = match ? match[1].trim() : entry.replace(/\{@[^}]+\}/g, '').trim();
  // Title-case
  name = name.replace(/\b\w/g, c => c.toUpperCase());
  // Capture any parenthetical annotation outside the tag
  const detailMatch = entry.replace(/\{@[^}]+\}/g, '').trim();
  return { name, detail: detailMatch || '' };
}

/**
 * Strip 5etools inline tags from an action name for plain-text display.
 * e.g. "Singularity Breath {@recharge 5}" → "Singularity Breath (Recharge 5–6)"
 * @param {string} name
 * @returns {string}
 */
export function cleanActionName(name) {
  return name
    .replace(/\{@recharge\s+(\d+)\}/g, (_, n) => ` (Recharge ${n}–6)`)
    .replace(/\{@[^}]+\}/g, '')
    .trim();
}

/**
 * Generate HTML string for a monster statblock
 * @param {Object} monster
 * @returns {string}
 */
export function parseStatblock(monster) {
  const hp = getAverageHp(monster.hp);
  const ac = getAcValue(monster.ac);
  const cr = formatCR(monster.cr);
  const type = getMonsterType(monster.type);
  const size = formatSize(monster.size);
  const alignment = formatAlignment(monster.alignment);
  const speed = formatSpeed(monster.speed);

  const strMod = getModifier(monster.str || 10);
  const dexMod = getModifier(monster.dex || 10);
  const conMod = getModifier(monster.con || 10);
  const intMod = getModifier(monster.int || 10);
  const wisMod = getModifier(monster.wis || 10);
  const chaMod = getModifier(monster.cha || 10);

  const acFrom = (Array.isArray(monster.ac) && monster.ac[0] && monster.ac[0].from)
    ? ` (${monster.ac[0].from.join(', ')})` : '';

  let html = `
    <div class="statblock">
      <div class="sb-creature-info">
        <p class="sb-type">${size} ${type}, ${alignment}</p>
      </div>
      <div class="sb-divider"></div>
      <div class="sb-core">
        <p><strong>Armor Class</strong> ${ac}${acFrom}</p>
        <p><strong>Hit Points</strong> ${hp} (${monster.hp?.formula || '?'})</p>
        <p><strong>Speed</strong> ${speed}</p>
      </div>
      <div class="sb-divider"></div>
      <div class="sb-ability-scores">
        <div class="sb-ability">
          <div class="sb-ability-name">STR</div>
          <div class="sb-ability-val">${monster.str || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(strMod)})</div>
        </div>
        <div class="sb-ability">
          <div class="sb-ability-name">DEX</div>
          <div class="sb-ability-val">${monster.dex || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(dexMod)})</div>
        </div>
        <div class="sb-ability">
          <div class="sb-ability-name">CON</div>
          <div class="sb-ability-val">${monster.con || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(conMod)})</div>
        </div>
        <div class="sb-ability">
          <div class="sb-ability-name">INT</div>
          <div class="sb-ability-val">${monster.int || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(intMod)})</div>
        </div>
        <div class="sb-ability">
          <div class="sb-ability-name">WIS</div>
          <div class="sb-ability-val">${monster.wis || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(wisMod)})</div>
        </div>
        <div class="sb-ability">
          <div class="sb-ability-name">CHA</div>
          <div class="sb-ability-val">${monster.cha || 10}</div>
          <div class="sb-ability-mod">(${formatModifier(chaMod)})</div>
        </div>
      </div>
      <div class="sb-divider"></div>
      <div class="sb-saves">
        <div class="sb-saves-title">🎲 Saving Throws <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-saves-grid">`;

  for (const { key, label } of SAVE_ABILITIES) {
    const bonus = getMonsterSaveBonus(monster, key);
    const bonusStr = formatModifier(bonus);
    const hasProficiency = monster.save && monster.save[key] !== undefined;
    html += `<button class="sb-save-roll sb-save-throw-btn${hasProficiency ? ' sb-save-proficient' : ''}" data-ability="${key}" data-mod="${bonus}" title="${label} saving throw: ${bonusStr}">
        <span class="sb-save-name">${label}</span>
        <span class="sb-save-mod">${bonusStr}</span>
      </button>`;
  }

  html += `</div>
        <div class="sb-save-result sb-saving-throw-result"></div>
      </div>
      <div class="sb-divider"></div>`;

  // Skill Checks: Perception (WIS), Stealth (DEX), Spellcasting (highest of INT/WIS/CHA)
  const perceptionParsed = monster.skill ? parseInt(monster.skill.perception, 10) : NaN;
  const perceptionBonus = !isNaN(perceptionParsed) ? perceptionParsed : wisMod;
  const stealthParsed = monster.skill ? parseInt(monster.skill.stealth, 10) : NaN;
  const stealthBonus = !isNaN(stealthParsed) ? stealthParsed : dexMod;
  const { mod: spellcastingBonus, ability: spellcastingAbility } = getSpellcastingModifier(intMod, wisMod, chaMod);

  html += `<div class="sb-skill-checks">
        <div class="sb-saves-title">🎯 Skill Checks <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-skill-checks-grid">
          <button class="sb-save-roll sb-skill-check${monster.skill?.perception !== undefined ? ' sb-save-proficient' : ''}" data-check="perception" data-mod="${perceptionBonus}" title="Perception check (WIS): ${formatModifier(perceptionBonus)}">
            <span class="sb-save-name">Percept.</span>
            <span class="sb-save-mod">${formatModifier(perceptionBonus)}</span>
          </button>
          <button class="sb-save-roll sb-skill-check${monster.skill?.stealth !== undefined ? ' sb-save-proficient' : ''}" data-check="stealth" data-mod="${stealthBonus}" title="Stealth check (DEX): ${formatModifier(stealthBonus)}">
            <span class="sb-save-name">Stealth</span>
            <span class="sb-save-mod">${formatModifier(stealthBonus)}</span>
          </button>
          <button class="sb-save-roll sb-skill-check" data-check="spellcasting" data-mod="${spellcastingBonus}" title="Spellcasting check (highest of INT/WIS/CHA = ${spellcastingAbility}): ${formatModifier(spellcastingBonus)}">
            <span class="sb-save-name">Spell.</span>
            <span class="sb-save-mod">${formatModifier(spellcastingBonus)}</span>
          </button>
        </div>
        <div class="sb-save-result sb-skill-result"></div>
      </div>
      <div class="sb-divider"></div>`;

  // Attacks section (below saves / skill checks)
  const attacks = parseMonsterAttacks(monster);
  if (attacks.length > 0) {
    html += `<div class="sb-attacks">
        <div class="sb-saves-title">⚔️ Attacks <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-attack-list">`;

    attacks.forEach(atk => {
      const displayName = cleanActionName(atk.name);
      const safeTitle = displayName.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const damageSummary = atk.damageDice.map((dice, i) => {
        const type = (atk.damageTypes || [])[i];
        return type ? `${dice} ${type}` : dice;
      }).join(' + ');
      html += `<div class="sb-attack-row">
          <div class="sb-attack-row-header">
            <span class="sb-attack-name" title="${safeTitle}">${displayName}</span>
            <div class="sb-attack-btns">`;

      if (!atk.isAoe) {
        const bonusStr = formatModifier(atk.hitBonus);
        html += `<button class="sb-atk-btn sb-atk-roll-btn" data-bonus="${atk.hitBonus}" title="${safeTitle}: to hit">
                <span class="sb-atk-label">ATK</span>
                <span class="sb-atk-val">${bonusStr}</span>
              </button>`;
      } else if (atk.isAoe && atk.saveDc !== null) {
        const abilityLabel = atk.saveAbility ? { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' }[atk.saveAbility] || '' : '';
        const dcBadgeLabel = abilityLabel ? `DC ${abilityLabel}` : 'DC';
        const dcBadgeTitle = `${safeTitle}: DC ${atk.saveDc}${abilityLabel ? ` ${abilityLabel}` : ''} saving throw`;
        html += `<span class="sb-atk-btn sb-dc-badge" title="${dcBadgeTitle}">
                <span class="sb-atk-label">${dcBadgeLabel}</span>
                <span class="sb-atk-val">${atk.saveDc}</span>
              </span>`;
      }

      html += `<button class="sb-atk-btn sb-dmg-roll-btn" data-damage="${atk.damageDice.join('|')}" data-damage-types="${(atk.damageTypes || []).join('|')}"${atk.saveDc !== null ? ` data-save-dc="${atk.saveDc}"` : ''}${atk.saveAbility ? ` data-save-ability="${atk.saveAbility}"` : ''} title="${safeTitle}: ${damageSummary}">
              <span class="sb-atk-label">DMG</span>
              <span class="sb-atk-val">${damageSummary}</span>
            </button>`;

      html += `</div></div>
          <div class="sb-attack-row-results">`;

      if (!atk.isAoe) {
        html += `<div class="sb-row-atk-result"></div>`;
      }
      html += `<div class="sb-row-dmg-result"></div>
          </div>
        </div>`;
    });

    html += `</div>
      </div>
      <div class="sb-divider"></div>`;
  }

  // Spells section (below attacks)
  const monsterSpells = parseMonsterSpells(monster);
  if (monsterSpells.length > 0) {
    // Build a header description from the spellcasting entry
    const scHeader = monster.spellcasting && monster.spellcasting[0]?.headerEntries
      ? parse5etools(monster.spellcasting[0].headerEntries[0] || '')
      : '';
    html += `<div class="sb-spells">
        <div class="sb-saves-title">✨ Spells</div>`;
    if (scHeader) {
      html += `<p class="sb-spell-header">${scHeader}</p>`;
    }
    html += `<div class="sb-spell-list">`;

    monsterSpells.forEach(({ spellName, frequency, detail, spellData }) => {
      const level = spellData ? (spellData.level === 0 ? 'Cantrip' : `Level ${spellData.level}`) : '';
      const school = spellData ? getSchoolName(spellData.school) : '';
      const castingTime = spellData ? spellData.castingTime : '';
      const range = spellData ? spellData.range : '';
      const duration = spellData ? spellData.duration : '';
      const desc = spellData ? spellData.desc : '';
      const detailStr = detail ? ` <em class="sb-spell-detail">${detail}</em>` : '';

      html += `<div class="sb-spell-row">
          <div class="sb-spell-row-header">
            <span class="sb-spell-name">${spellName}</span>${detailStr}
            <span class="sb-spell-freq">${frequency}</span>
          </div>`;

      if (spellData) {
        html += `<div class="sb-spell-meta">`;
        if (level) html += `<span class="sb-spell-tag">${level}</span>`;
        if (school) html += `<span class="sb-spell-tag">${school}</span>`;
        if (castingTime) html += `<span class="sb-spell-tag">⏱ ${castingTime}</span>`;
        if (range) html += `<span class="sb-spell-tag">📏 ${range}</span>`;
        if (duration) html += `<span class="sb-spell-tag">⌛ ${duration}</span>`;
        html += `</div>`;
        if (desc) html += `<div class="sb-spell-desc">${desc}</div>`;
      }

      html += `</div>`;
    });

    html += `</div>
      </div>
      <div class="sb-divider"></div>`;
  }

  html += `<div class="sb-secondary">`;

  // Skills
  if (monster.skill && Object.keys(monster.skill).length > 0) {
    const skills = Object.entries(monster.skill).map(([k, v]) => {
      const val = String(v);
      const signed = (val.startsWith('+') || val.startsWith('-')) ? val : `+${val}`;
      return `${capitalize(k)} ${signed}`;
    }).join(', ');
    html += `<p><strong>Skills</strong> ${skills}</p>`;
  }

  // Vulnerabilities
  if (monster.vulnerable && monster.vulnerable.length > 0) {
    html += `<p><strong>Damage Vulnerabilities</strong> ${monster.vulnerable.join('; ')}</p>`;
  }

  // Resistances
  if (monster.resist && monster.resist.length > 0) {
    const resists = monster.resist.map(r => typeof r === 'object' ? r.resist?.join(', ') || '' : r).join('; ');
    html += `<p><strong>Damage Resistances</strong> ${resists}</p>`;
  }

  // Immunities
  if (monster.immune && monster.immune.length > 0) {
    const imm = monster.immune.map(r => typeof r === 'object' ? r.immune?.join(', ') || '' : r).join('; ');
    html += `<p><strong>Damage Immunities</strong> ${imm}</p>`;
  }

  // Condition Immunities
  if (monster.conditionImmune && monster.conditionImmune.length > 0) {
    html += `<p><strong>Condition Immunities</strong> ${monster.conditionImmune.join(', ')}</p>`;
  }

  // Senses
  if (monster.senses && monster.senses.length > 0) {
    html += `<p><strong>Senses</strong> ${monster.senses.join(', ')}, passive Perception ${monster.passive || 10}</p>`;
  } else {
    html += `<p><strong>Senses</strong> passive Perception ${monster.passive || 10}</p>`;
  }

  // Languages
  if (monster.languages) {
    const langs = Array.isArray(monster.languages) ? monster.languages.join(', ') : monster.languages;
    html += `<p><strong>Languages</strong> ${langs || '—'}</p>`;
  }

  html += `<p><strong>Challenge</strong> ${cr} (${getCrXp(cr)} XP)</p>`;
  html += `</div><div class="sb-divider"></div>`;

  // Traits
  if (monster.trait && monster.trait.length > 0) {
    html += `<div class="sb-section">`;
    monster.trait.forEach(trait => {
      const entryText = Array.isArray(trait.entries) ? trait.entries.map(e => parseEntry(e)).join(' ') : '';
      html += `<div class="sb-trait">
        <p><strong><em>${trait.name}.</em></strong> ${entryText}</p>
      </div>`;
    });
    html += `</div><div class="sb-divider"></div>`;
  }

  // Actions
  if (monster.action && monster.action.length > 0) {
    html += `<div class="sb-section">
      <h4 class="sb-section-title">Actions</h4>`;
    monster.action.forEach(action => {
      const entryText = Array.isArray(action.entries) ? action.entries.map(e => parseEntry(e)).join(' ') : '';
      html += `<div class="sb-action">
        <p><strong>${action.name}.</strong> ${entryText}</p>
      </div>`;
    });
    html += `</div>`;
  }

  // Bonus Actions
  if (monster.bonus && monster.bonus.length > 0) {
    html += `<div class="sb-divider"></div><div class="sb-section">
      <h4 class="sb-section-title">Bonus Actions</h4>`;
    monster.bonus.forEach(action => {
      const entryText = Array.isArray(action.entries) ? action.entries.map(e => parseEntry(e)).join(' ') : '';
      html += `<div class="sb-action"><p><strong>${action.name}.</strong> ${entryText}</p></div>`;
    });
    html += `</div>`;
  }

  // Reactions
  if (monster.reaction && monster.reaction.length > 0) {
    html += `<div class="sb-divider"></div><div class="sb-section">
      <h4 class="sb-section-title">Reactions</h4>`;
    monster.reaction.forEach(reaction => {
      const entryText = Array.isArray(reaction.entries) ? reaction.entries.map(e => parseEntry(e)).join(' ') : '';
      html += `<div class="sb-action"><p><strong>${reaction.name}.</strong> ${entryText}</p></div>`;
    });
    html += `</div>`;
  }

  // Legendary Actions
  if (monster.legendary && monster.legendary.length > 0) {
    html += `<div class="sb-divider"></div><div class="sb-section">
      <h4 class="sb-section-title">Legendary Actions</h4>`;
    monster.legendary.forEach(la => {
      const entryText = Array.isArray(la.entries) ? la.entries.map(e => parseEntry(e)).join(' ') : '';
      html += `<div class="sb-action"><p><strong>${la.name}.</strong> ${entryText}</p></div>`;
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Parse a single entry (can be string or object)
 */
function parseEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return parse5etools(entry);
  if (typeof entry === 'object') {
    if (entry.type === 'entries' && Array.isArray(entry.entries)) {
      return entry.entries.map(e => parseEntry(e)).join(' ');
    }
    if (entry.type === 'list' && Array.isArray(entry.items)) {
      return '<ul>' + entry.items.map(i => `<li>${parseEntry(i)}</li>`).join('') + '</ul>';
    }
    if (entry.type === 'table') return '[table]';
    return parse5etools(String(entry));
  }
  return String(entry);
}

/**
 * Capitalize first letter of string
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get approximate XP value for a CR
 */
function getCrXp(cr) {
  const table = {
    '0': '10', '1/8': '25', '1/4': '50', '1/2': '100',
    '1': '200', '2': '450', '3': '700', '4': '1,100',
    '5': '1,800', '6': '2,300', '7': '2,900', '8': '3,900',
    '9': '5,000', '10': '5,900', '11': '7,200', '12': '8,400',
    '13': '10,000', '14': '11,500', '15': '13,000', '16': '15,000',
    '17': '18,000', '18': '20,000', '19': '22,000', '20': '25,000',
  };
  return table[String(cr)] || '—';
}

/**
 * Create a token data object from a monster
 * @param {Object} monster
 * @param {number|null} overrideHp
 * @returns {Object} token data
 */
export function createMonsterToken(monster, overrideHp = null) {
  const maxHp = overrideHp || getAverageHp(monster.hp);
  const dexMod = getModifier(monster.dex || 10);

  return {
    id: generateId(),
    name: monster.name,
    abbr: getAbbr(monster.name),
    type: 'monster',
    hp: maxHp,
    maxHp,
    ac: getAcValue(monster.ac),
    str: monster.str || 10,
    dex: monster.dex || 10,
    con: monster.con || 10,
    int: monster.int || 10,
    wis: monster.wis || 10,
    cha: monster.cha || 10,
    dexMod,
    initiative: null,
    conditions: [],
    color: 'monster',
    monsterData: monster,
  };
}
