/**
 * Character Import Module
 * Supports D&D Beyond JSON export and G-sheet (Google Sheets) JSON export.
 */

import { generateId, getModifier } from './utils.js';

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
  const firstDefined = (obj, keys) => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return undefined;
  };
  const toInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  const toStringArray = (value) => {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') {
      return value.split(/[,;|]/).map(v => v.trim()).filter(Boolean);
    }
    return [];
  };
  const toEntriesArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(item => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { name: 'Feature', entries: [item] };
        }
        if (typeof item === 'object') {
          const entries = Array.isArray(item.entries)
            ? item.entries
            : (item.entry ? [String(item.entry)] : []);
          return {
            name: item.name || item.title || 'Feature',
            entries: entries.map(e => String(e)),
          };
        }
        return null;
      }).filter(Boolean);
    }
    if (typeof value === 'string') {
      return [{ name: 'Feature', entries: [value] }];
    }
    if (typeof value === 'object') {
      return Object.entries(value).map(([name, entry]) => ({
        name,
        entries: Array.isArray(entry) ? entry.map(e => String(e)) : [String(entry)],
      }));
    }
    return [];
  };
  const normalizeSaveAbility = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const map = {
      str: 'str', strength: 'str',
      dex: 'dex', dexterity: 'dex',
      con: 'con', constitution: 'con',
      int: 'int', intelligence: 'int',
      wis: 'wis', wisdom: 'wis',
      cha: 'cha', charisma: 'cha',
    };
    return map[raw] || null;
  };
  const toModifierMap = (value) => {
    if (!value || typeof value !== 'object') return {};
    const out = {};
    const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha', 'perception', 'stealth'];
    keys.forEach(k => {
      const raw = firstDefined(value, [k, k.toUpperCase(), k.charAt(0).toUpperCase() + k.slice(1)]);
      if (raw !== undefined) {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) out[k] = n;
      }
    });
    return out;
  };
  const toSpeed = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const n = parseInt(trimmed, 10);
      return /^-?\d+$/.test(trimmed) && Number.isFinite(n) ? n : trimmed;
    }
    if (typeof value === 'object') {
      const speed = {};
      ['walk', 'fly', 'swim', 'climb', 'burrow'].forEach(mode => {
        const raw = firstDefined(value, [mode, mode.toUpperCase(), mode.charAt(0).toUpperCase() + mode.slice(1)]);
        if (raw !== undefined) {
          const n = parseInt(raw, 10);
          if (!isNaN(n)) speed[mode] = n;
        }
      });
      return Object.keys(speed).length ? speed : undefined;
    }
    return undefined;
  };

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
      const saveDcRaw = atk.saveDc || atk.dc || atk.DC || atk.saveDC || atk.SaveDC;
      const saveDc = saveDcRaw !== undefined ? (parseInt(saveDcRaw, 10) || null) : null;
      const saveAbility = normalizeSaveAbility(atk.saveAbility || atk.dcAbility || atk.save || atk.saveStat);
      const damageTypes = toStringArray(atk.damageTypes || atk.damageType || atk.DamageTypes || atk.DamageType);

      attacks.push({
        name: attackName,
        hitBonus,
        damageDice: [String(damage).trim()],
        damageTypes,
        isAoe,
        saveDc,
        saveAbility,
      });
    });
  }

  const speed = toSpeed(firstDefined(data, ['speed', 'Speed', 'movement', 'Movement', 'walkSpeed', 'WalkSpeed']));
  const save = toModifierMap(firstDefined(data, ['save', 'saves', 'savingThrows', 'SavingThrows']) || {});
  ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach((key) => {
    const explicit = firstDefined(data, [`${key}Save`, `${key.toUpperCase()}Save`, `${key}_save`, `${key.toUpperCase()}_SAVE`]);
    if (explicit !== undefined) {
      const n = parseInt(explicit, 10);
      if (!isNaN(n)) save[key] = n;
    }
  });
  const skill = toModifierMap(firstDefined(data, ['skill', 'skills', 'Skills']) || {});
  ['perception', 'stealth'].forEach((key) => {
    const explicit = firstDefined(data, [key, key.toUpperCase(), key.charAt(0).toUpperCase() + key.slice(1)]);
    if (explicit !== undefined) {
      const n = parseInt(explicit, 10);
      if (!isNaN(n)) skill[key] = n;
    }
  });
  const vulnerable = toStringArray(firstDefined(data, ['vulnerable', 'Vulnerable', 'damageVulnerabilities', 'DamageVulnerabilities']));
  const resist = toStringArray(firstDefined(data, ['resist', 'resistance', 'resistances', 'Resist', 'Resistances', 'damageResistances', 'DamageResistances']));
  const immune = toStringArray(firstDefined(data, ['immune', 'immunity', 'immunities', 'Immune', 'Immunities', 'damageImmunities', 'DamageImmunities']));
  const conditionImmune = toStringArray(firstDefined(data, ['conditionImmune', 'ConditionImmune', 'conditionImmunities', 'ConditionImmunities']));
  const senses = toStringArray(firstDefined(data, ['senses', 'Senses']));
  const passive = toInt(firstDefined(data, ['passive', 'passivePerception', 'Passive', 'PassivePerception']), undefined);
  const languagesRaw = firstDefined(data, ['languages', 'Languages']);
  const languages = toStringArray(languagesRaw);
  const trait = toEntriesArray(firstDefined(data, ['trait', 'traits', 'Trait', 'Traits']));
  const action = toEntriesArray(firstDefined(data, ['action', 'actions', 'Action', 'Actions']));
  const reaction = toEntriesArray(firstDefined(data, ['reaction', 'reactions', 'Reaction', 'Reactions']));
  const legendary = toEntriesArray(firstDefined(data, ['legendary', 'legendaryActions', 'Legendary', 'LegendaryActions']));
  const spellcastingRaw = firstDefined(data, ['spellcasting', 'Spellcasting']);
  const spellcasting = Array.isArray(spellcastingRaw) ? spellcastingRaw : (spellcastingRaw && typeof spellcastingRaw === 'object' ? [spellcastingRaw] : []);

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
    speed,
    save,
    skill,
    vulnerable,
    resist,
    immune,
    conditionImmune,
    senses,
    passive,
    languages,
    trait,
    action,
    reaction,
    legendary,
    spellcasting,
    attacks,
    source: 'gsheet',
  };
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
