/**
 * Character Import Module
 * Supports D&D Beyond JSON export and G-sheet (Google Sheets) JSON export,
 * including direct import via the Google Visualization API (gviz/tq endpoint).
 */

import { generateId, getModifier } from './utils.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Case-insensitive, whitespace/punctuation-normalised field lookup.
 * Tries each candidate key in order; returns the first non-empty value found.
 * @param {Object} data
 * @param {...string} keys
 * @returns {*}
 */
function findField(data, ...keys) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') return data[key];
    const norm = key.toLowerCase().replace(/[\s_\-]/g, '');
    for (const k of Object.keys(data)) {
      if (k.toLowerCase().replace(/[\s_\-]/g, '') === norm &&
          data[k] !== undefined && data[k] !== null && data[k] !== '') {
        return data[k];
      }
    }
  }
  return undefined;
}

/**
 * Convert a raw field value into a trimmed string array.
 * Accepts an existing array, a comma/semicolon-separated string, or null.
 * @param {*} val
 * @returns {string[]}
 */
function parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
  return String(val).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Proficiency bonus by character level (5e table).
 * @param {number} level
 * @returns {number}
 */
export function getProficiencyBonus(level) {
  if (level < 5) return 2;
  if (level < 9) return 3;
  if (level < 13) return 4;
  if (level < 17) return 5;
  return 6;
}

/**
 * Parse a D&D Beyond character JSON export into our standard character format.
 *
 * D&D Beyond exports can be obtained from the character page:
 *   Character Settings → Export → JSON
 *
 * The exported file wraps character data in a "data" key, but we also accept
 * a bare character object for flexibility.
 *
 * @param {Object} raw - Raw parsed JSON from the DDB export file
 * @returns {Object} Normalized character data
 */
export function parseDnDBeyondJSON(raw) {
  // DDB exports wrap everything under a "data" key
  const data = (raw && typeof raw === 'object' && raw.data) ? raw.data : (raw || {});

  const name = data.name || data.characterName || 'Unknown Character';

  // Ability scores: DDB uses [{id: 1, value: N}, ...] where id 1-6 = STR-CHA
  const stats = Array.isArray(data.stats) ? data.stats : [];
  const getStat = (id) => {
    const s = stats.find(s => s.id === id);
    return s && s.value != null ? s.value : 10;
  };
  const str = getStat(1);
  const dex = getStat(2);
  const con = getStat(3);
  const int = getStat(4);
  const wis = getStat(5);
  const cha = getStat(6);

  // HP
  const maxHp = data.overrideHitPoints || data.baseHitPoints || 20;
  const removedHp = data.removedHitPoints || 0;
  const hp = Math.max(0, maxHp - removedHp);

  // AC — DDB stores this on overrideArmorClass or as computed armorClass
  const ac = data.overrideArmorClass || data.armorClass || 10;

  // Level and class
  const classes = Array.isArray(data.classes) ? data.classes : [];
  const totalLevel = classes.reduce((sum, c) => sum + (c.level || 0), 0) || 1;
  const primaryClass = classes[0];
  const className = primaryClass?.definition?.name || primaryClass?.name || 'Adventurer';

  const profBonus = getProficiencyBonus(totalLevel);

  // Saving throw proficiencies — gathered from modifier lists
  const saveProficiencies = {};
  const statNameToKey = {
    'strength': 'str', 'dexterity': 'dex', 'constitution': 'con',
    'intelligence': 'int', 'wisdom': 'wis', 'charisma': 'cha',
  };
  const allModifiers = [
    ...(data.modifiers?.class || []),
    ...(data.modifiers?.race || []),
    ...(data.modifiers?.background || []),
    ...(data.modifiers?.feat || []),
    ...(data.modifiers?.item || []),
  ];
  allModifiers.forEach(mod => {
    if (mod.type === 'proficiency' && typeof mod.subType === 'string' && mod.subType.endsWith('-saving-throws')) {
      const abilityName = mod.subType.replace('-saving-throws', '');
      const abilityKey = statNameToKey[abilityName];
      if (abilityKey) saveProficiencies[abilityKey] = true;
    }
  });

  // Attacks from equipped weapons in inventory
  const attacks = [];
  const inventory = Array.isArray(data.inventory) ? data.inventory : [];
  inventory.forEach(item => {
    if (!item.equipped) return;
    const def = item.definition || {};
    if (!def.filterType) return;
    if (!def.filterType.toLowerCase().includes('weapon')) return;

    const itemName = def.name || 'Unknown Weapon';
    const baseDice = def.damage?.diceString || '1d4';
    const fixedBonus = def.fixedDamage || 0;
    const damageDice = fixedBonus ? `${baseDice}+${fixedBonus}` : baseDice;

    // Determine attack ability (STR vs DEX for finesse/ranged)
    const properties = Array.isArray(def.properties) ? def.properties : [];
    const isFinesse = properties.some(p => p.name?.toLowerCase() === 'finesse');
    const isRanged = def.attackType === 2;
    let atkStatMod;
    if (isFinesse) {
      atkStatMod = Math.max(getModifier(str), getModifier(dex));
    } else if (isRanged) {
      atkStatMod = getModifier(dex);
    } else {
      atkStatMod = getModifier(str);
    }

    attacks.push({
      name: itemName,
      hitBonus: atkStatMod + profBonus,
      damageDice: [damageDice],
      isAoe: false,
    });
  });

  return {
    id: generateId(),
    name,
    hp,
    maxHp,
    ac,
    str, dex, con, int, wis, cha,
    class: className,
    level: totalLevel,
    proficiencyBonus: profBonus,
    saveProficiencies,
    attacks,
    source: 'dndbeyond',
  };
}

/**
 * Parse a G-sheet (Google Sheets D&D character sheet) JSON export.
 *
 * This supports a widely-used community export format.  Users can install
 * a Google Apps Script in their character sheet and call:
 *
 *   Tools → Script editor → run exportCharacterJSON()
 *
 * to get JSON matching this schema.  We also accept several common variant
 * field-name conventions found in popular Google Sheets templates.
 *
 * Minimum required fields: a name and at least HP.
 *
 * Example JSON:
 * {
 *   "charName": "Aela",
 *   "maxHP": 32, "currentHP": 32,
 *   "AC": 15,
 *   "STR": 16, "DEX": 14, "CON": 14, "INT": 10, "WIS": 12, "CHA": 8,
 *   "class": "Ranger", "level": 5,
 *   "strSaveProf": true, "dexSaveProf": false, ...
 *   "attacks": [
 *     { "name": "Longbow", "atkBonus": "+7", "damage": "1d8+4" },
 *     { "name": "Shortsword", "atkBonus": "+6", "damage": "1d6+4" }
 *   ]
 * }
 *
 * @param {Object|string} raw - Parsed or raw JSON string
 * @returns {Object} Normalized character data
 */
export function parseGSheetJSON(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('Invalid JSON — please paste valid character JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid character data — expected a JSON object.');
  }

  // Name (multiple common conventions)
  const name = data.charName || data.characterName || data.name || data.CharacterName || 'Unknown Character';

  // HP
  const maxHp = parseInt(data.maxHP || data.MaxHP || data.hp_max || data.HitPointMaximum || data.maxHitPoints || data.MaxHitPoints) || 20;
  const hp = parseInt(data.currentHP || data.CurrentHP || data.hp_current || data.HitPoints || maxHp) || maxHp;

  // AC
  const ac = parseInt(data.AC || data.armorClass || data.ArmorClass || data.armor_class) || 10;

  // Ability scores
  const str = parseInt(data.STR || data.str || data.Strength || data.strength) || 10;
  const dex = parseInt(data.DEX || data.dex || data.Dexterity || data.dexterity) || 10;
  const con = parseInt(data.CON || data.con || data.Constitution || data.constitution) || 10;
  const int = parseInt(data.INT || data.int || data.Intelligence || data.intelligence) || 10;
  const wis = parseInt(data.WIS || data.wis || data.Wisdom || data.wisdom) || 10;
  const cha = parseInt(data.CHA || data.cha || data.Charisma || data.charisma) || 10;

  // Level and class
  const level = parseInt(data.level || data.Level || data.characterLevel || data.CharacterLevel) || 1;
  const className = data.class || data.Class || data.className || data.ClassName || 'Adventurer';
  const profBonus = getProficiencyBonus(level);

  // Saving throw proficiencies
  const saveProficiencies = {};
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(key => {
    const upper = key.toUpperCase();
    if (
      data[`${key}SaveProf`] ||
      data[`${upper}SaveProf`] ||
      data[`${key}_save_prof`] ||
      data[`${upper}_SAVE_PROF`] ||
      data[`${key}_save_proficiency`]
    ) {
      saveProficiencies[key] = true;
    }
  });

  // Attacks
  const attacks = [];
  const rawAttacks = data.attacks || data.Attacks || data.weapons || data.Weapons || [];
  if (Array.isArray(rawAttacks)) {
    rawAttacks.forEach(atk => {
      if (!atk) return;
      const attackName = atk.name || atk.attackName || atk.Name || 'Attack';
      const rawBonus = atk.atkBonus || atk.attackBonus || atk.AttackBonus || atk.bonus || '0';
      const hitBonus = parseInt(String(rawBonus).replace(/^\+/, '')) || 0;
      const damage = atk.damage || atk.Damage || atk.damageDice || atk.DamageDice || '1d4';
      const isAoe = !!(atk.isAoe || atk.aoe || atk.IsAoe);

      attacks.push({
        name: attackName,
        hitBonus,
        damageDice: [String(damage).trim()],
        isAoe,
      });
    });
  }

  // ── Extended monster-statblock stats ────────────────────────────────────────

  // Speed
  const rawSpeed = findField(data, 'speed', 'Speed', 'walkSpeed', 'walk_speed',
    'movementSpeed', 'movement_speed', 'move', 'Move');
  const speed = rawSpeed != null
    ? (typeof rawSpeed === 'number' ? `${rawSpeed} ft.` : String(rawSpeed))
    : '30 ft.';

  // Damage resistances / immunities / vulnerabilities
  const damageResistances = parseList(
    findField(data, 'damageResistances', 'damage_resistances', 'resistances',
      'Resistances', 'resist', 'Resist', 'DamageResistances'));
  const damageImmunities = parseList(
    findField(data, 'damageImmunities', 'damage_immunities', 'immunities',
      'Immunities', 'immune', 'Immune', 'DamageImmunities'));
  const damageVulnerabilities = parseList(
    findField(data, 'damageVulnerabilities', 'damage_vulnerabilities', 'vulnerabilities',
      'Vulnerabilities', 'vulnerable', 'Vulnerable', 'DamageVulnerabilities'));

  // Condition immunities
  const conditionImmunities = parseList(
    findField(data, 'conditionImmunities', 'condition_immunities', 'conditionImmune',
      'condition_immune', 'ConditionImmunities', 'conditionimmunities'));

  // Senses & languages
  const senses = String(findField(data, 'senses', 'Senses', 'vision', 'Vision') || '');
  const languages = String(findField(data, 'languages', 'Languages') || '');

  // Challenge Rating
  const rawCr = findField(data, 'cr', 'CR', 'challengeRating', 'challenge_rating',
    'ChallengeRating', 'challenge', 'Challenge');
  const cr = rawCr != null ? String(rawCr) : null;

  // Alignment, size, creature type
  const alignment = String(findField(data, 'alignment', 'Alignment') || '');
  const size = String(findField(data, 'size', 'Size', 'creatureSize', 'creature_size') || '');
  const creatureType = String(
    findField(data, 'type', 'Type', 'creatureType', 'creature_type', 'race', 'Race') || '');

  // Traits / Special abilities (stored as [{name, text}] or a plain string)
  const rawTraits = findField(data, 'traits', 'Traits', 'specialAbilities', 'special_abilities',
    'specialTraits', 'features', 'Features', 'abilities', 'Abilities');
  let traits = [];
  if (rawTraits) {
    if (Array.isArray(rawTraits)) {
      traits = rawTraits.map(t => (typeof t === 'object' && t !== null)
        ? { name: t.name || 'Trait', text: t.text || t.description || '' }
        : { name: 'Trait', text: String(t) });
    } else {
      traits = [{ name: 'Special Abilities', text: String(rawTraits) }];
    }
  }

  return {
    id: generateId(),
    name,
    hp,
    maxHp,
    ac,
    str, dex, con, int, wis, cha,
    class: className,
    level,
    proficiencyBonus: profBonus,
    saveProficiencies,
    attacks,
    speed,
    damageResistances,
    damageImmunities,
    damageVulnerabilities,
    conditionImmunities,
    senses,
    languages,
    cr,
    alignment,
    size,
    type: creatureType,
    traits,
    source: 'gsheet',
  };
}

/**
 * Convert a Google Visualization API (gviz/tq) table response into a flat
 * key-value map that parseGSheetJSON can consume.
 *
 * Two common Google Sheets character-sheet layouts are supported:
 *
 *   1. Key-Value rows — each row has the field name in its first non-empty
 *      string cell and the value in the immediately following cell:
 *        ["Character Name", "Aela"]
 *        ["Max HP",          32   ]
 *
 *   2. Header row + data row — the first row contains field names; the second
 *      row contains the corresponding values:
 *        header: ["Name", "HP", "AC", "STR", …]
 *        data  : ["Aela",  32,   15,    16,  …]
 *
 * Both strategies run and their results are merged (key-value pairs take
 * priority so they override header-row matches for the same key).
 *
 * @param {Object} gvizData - Parsed JSON from the gviz/tq endpoint (the
 *   JSONP wrapper must be stripped before calling this function).
 * @returns {Object} Flat key-value map suitable for parseGSheetJSON.
 */
export function parseGSheetVisualizationData(gvizData) {
  const table = gvizData && gvizData.table;
  if (!table || !Array.isArray(table.rows) || table.rows.length === 0) return {};

  // Extract the primitive value from a gviz cell object.
  // Numbers are kept as-is; strings are trimmed; null/undefined → null.
  const cellVal = (cell) => {
    if (!cell || cell.v == null) return null;
    if (typeof cell.v === 'number') return cell.v;
    const s = String(cell.v).trim();
    return s || null;
  };

  const kv = {};

  // Strategy 2 first (lower priority): header row + data row
  if (table.rows.length >= 2) {
    const hRow = table.rows[0];
    const dRow = table.rows[1];
    if (hRow?.c && dRow?.c) {
      for (let i = 0; i < hRow.c.length; i++) {
        const header = cellVal(hRow.c[i]);
        if (typeof header !== 'string' || !header) continue;
        const val = cellVal(dRow.c[i]);
        kv[header] = val !== null ? val : '';
      }
    }
  }

  // Strategy 1 (higher priority): key-value pairs in each row
  table.rows.forEach(row => {
    if (!row?.c) return;
    const cells = row.c;
    // Find the first cell that contains a non-empty string — that is the key
    let keyIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      const v = cellVal(cells[i]);
      if (v !== null && typeof v === 'string') { keyIdx = i; break; }
    }
    if (keyIdx === -1 || keyIdx + 1 >= cells.length) return;
    const key = String(cellVal(cells[keyIdx])).trim();
    if (!key) return;
    const val = cellVal(cells[keyIdx + 1]);
    // Only store if a value cell actually exists next to the key
    if (val != null) {
      kv[key] = val;
    }
  });

  return kv;
}

/**
 * Read a File object as text and parse as JSON.
 * @param {File} file
 * @returns {Promise<Object>}
 */
export function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(JSON.parse(e.target.result));
      } catch {
        reject(new Error('Could not parse file as JSON. Make sure it is a valid JSON export.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}
