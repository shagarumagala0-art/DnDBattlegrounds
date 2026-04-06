import { state } from './state.js';
import { generateId, getAbbr, getModifier, formatModifier, getSpellcastingModifier, showToast } from './utils.js';
import { getProficiencyBonus } from './import.js';

/**
 * List of CORS proxy prefixes to try (in order) when direct fetch fails.
 * Each entry is a function that takes the target URL and returns the proxied URL.
 */
const CORS_PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

/**
 * Attempt to import a character from a DiceCloud share URL.
 * Falls back to CORS proxy servers when a direct request is blocked.
 * @param {string} url - DiceCloud share URL
 * @returns {Promise<Object|null>}
 */
export async function importCharacter(url) {
  const statusEl = document.getElementById('import-status');

  if (!url || !url.trim()) {
    showStatus(statusEl, 'Please enter a DiceCloud URL.', 'error');
    return null;
  }

  // Validate URL using the URL constructor and check the hostname properly
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    showStatus(statusEl, '⚠️ Invalid URL format. Please check the link.', 'error');
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'dicecloud.com' && !hostname.endsWith('.dicecloud.com')) {
    showStatus(statusEl, '⚠️ Please enter a valid DiceCloud URL (e.g. https://v2.dicecloud.com/character/...)', 'error');
    return null;
  }

  showStatus(statusEl, '⏳ Attempting to connect to DiceCloud...', 'loading');

  // Extract character ID from URL
  const match = url.match(/\/character\/([a-zA-Z0-9]+)/);
  const charId = match ? match[1] : null;

  if (!charId) {
    showStatus(statusEl, '⚠️ Could not parse character ID from URL. Please check the link.', 'error');
    return null;
  }

  // Try direct fetch first, then CORS proxies on failure
  const targetUrl = `https://v2.dicecloud.com/character/${charId}/json`;
  let lastError = null;

  const endpoints = [targetUrl, ...CORS_PROXIES.map(fn => fn(targetUrl))];

  for (let i = 0; i < endpoints.length; i++) {
    const endpoint = endpoints[i];
    const isProxy = i > 0;

    if (isProxy) {
      showStatus(statusEl, `⏳ Direct import blocked — trying proxy ${i}...`, 'loading');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(endpoint, {
        signal: controller.signal,
        mode: 'cors',
      });

      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const charData = parseDiceCloudData(data, charId);
      showStatus(statusEl, `✅ Successfully imported ${charData.name}!`, 'success');
      return charData;

    } catch (err) {
      lastError = err;
      // Continue to next proxy
    }
  }

  // All endpoints failed
  showStatus(statusEl,
    `<strong>⚠️ Import failed</strong><br>
    DiceCloud does not allow direct browser imports and the proxy servers
    could not reach it either. Please use the <strong>Manual Entry</strong>
    form below to add your character.<br>
    <small>Character ID detected: <code>${charId}</code></small>`,
    'cors-warning'
  );
  return null;
}

/**
 * Parse DiceCloud API response into character data
 * @param {Object} data
 * @param {string} charId
 * @returns {Object}
 */
function parseDiceCloudData(data, charId) {
  const level = data.level?.value || 1;
  const profBonus = getProficiencyBonus(level);

  // Saving throw proficiencies from DiceCloud property list
  const saveProficiencies = {};
  const saveKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  if (Array.isArray(data.saves)) {
    data.saves.forEach(save => {
      const key = save.ability?.toLowerCase();
      if (saveKeys.includes(key) && save.proficient) {
        saveProficiencies[key] = true;
      }
    });
  }

  // Attacks from DiceCloud actions/attacks array
  const attacks = [];
  if (Array.isArray(data.attacks)) {
    data.attacks.forEach(atk => {
      if (!atk.name) return;
      const hitBonus = parseInt(atk.rollBonus) || 0;
      const damage = atk.damage || '1d4';
      attacks.push({
        name: atk.name,
        hitBonus,
        damageDice: [String(damage).trim()],
        isAoe: false,
      });
    });
  }

  return {
    id: generateId(),
    diceCloudId: charId,
    name: data.name || data.characterName || 'Unknown Character',
    hp: data.hp?.value || data.hitPoints?.value || 20,
    maxHp: data.hp?.max || data.hitPoints?.max || 20,
    ac: data.ac?.value || data.armorClass?.value || 10,
    str: data.abilities?.str?.value || 10,
    dex: data.abilities?.dex?.value || 10,
    con: data.abilities?.con?.value || 10,
    int: data.abilities?.int?.value || 10,
    wis: data.abilities?.wis?.value || 10,
    cha: data.abilities?.cha?.value || 10,
    class: data.classes?.[0]?.name || 'Adventurer',
    level,
    proficiencyBonus: profBonus,
    saveProficiencies,
    attacks,
    source: 'dicecloud',
  };
}

/**
 * Create a player token from character data
 * @param {Object} charData
 * @returns {Object} token data
 */
export function createCharacterToken(charData) {
  return {
    id: generateId(),
    name: charData.name,
    abbr: getAbbr(charData.name),
    type: 'player',
    hp: charData.hp || charData.maxHp || 20,
    maxHp: charData.maxHp || 20,
    ac: charData.ac || 10,
    str: charData.str || 10,
    dex: charData.dex || 10,
    con: charData.con || 10,
    int: charData.int || 10,
    wis: charData.wis || 10,
    cha: charData.cha || 10,
    dexMod: getModifier(charData.dex || 10),
    initiative: null,
    conditions: [],
    color: 'player',
    monsterData: null,
    characterData: charData,
  };
}

/**
 * Create a manual player token from the custom player form
 * @param {Object} formData
 * @returns {Object}
 */
export function createManualCharacter(formData) {
  const attacks = Array.isArray(formData.attacks) ? formData.attacks : [];
  const level = parseInt(formData.level) || 1;
  const charData = {
    id: generateId(),
    name: formData.name || 'Player',
    hp: parseInt(formData.hp) || 20,
    maxHp: parseInt(formData.hp) || 20,
    ac: parseInt(formData.ac) || 10,
    str: parseInt(formData.str) || 10,
    dex: parseInt(formData.dex) || 10,
    con: parseInt(formData.con) || 10,
    int: parseInt(formData.int) || 10,
    wis: parseInt(formData.wis) || 10,
    cha: parseInt(formData.cha) || 10,
    class: formData.class || 'Adventurer',
    level,
    proficiencyBonus: getProficiencyBonus(level),
    saveProficiencies: {},
    attacks,
    source: 'manual',
  };

  state.characters.push(charData);
  return charData;
}

/**
 * Render the character list in the Characters tab
 */
export function renderCharacterList() {
  const container = document.getElementById('character-list');
  if (!container) return;

  if (state.characters.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👤</div>
        <p>No party members yet.</p>
        <p class="empty-hint">Paste your sheet link above to import a character.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  state.characters.forEach(char => {
    const tokenOnGrid = state.tokens.find(t => t.characterData?.id === char.id || t.id === char.tokenId);
    const isOnGrid = !!tokenOnGrid;
    const sourceIcon = { dndbeyond: '📘', dicecloud: '☁️', gsheet: '📊', manual: '✏️' }[char.source] || '👤';

    const card = document.createElement('div');
    card.className = 'character-card';
    card.innerHTML = `
      <div class="char-badge">${getAbbr(char.name)}</div>
      <div class="char-details">
        <div class="char-name">${char.name} <span class="char-source-icon" title="${char.source || 'manual'}">${sourceIcon}</span></div>
        <div class="char-stats">
          <span>HP: ${char.maxHp}</span>
          <span>AC: ${char.ac}</span>
          ${char.level ? `<span>Lv ${char.level} ${char.class || ''}</span>` : ''}
        </div>
      </div>
      <div class="char-actions">
        <button class="btn btn-sm btn-gold" data-view-char="${char.id}">📋 Sheet</button>
        ${isOnGrid
          ? `<span class="on-grid-badge">On Grid</span>`
          : `<button class="btn btn-sm btn-primary" data-char-id="${char.id}">⚔️ To Arena</button>`
        }
        <button class="btn btn-sm btn-danger" data-remove-char="${char.id}">✕</button>
      </div>
    `;

    card.querySelector('[data-view-char]')?.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('viewCharSheet', { detail: { charId: char.id } }));
    });

    if (!isOnGrid) {
      card.querySelector('[data-char-id]')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('addCharToArena', { detail: { charId: char.id } }));
      });
    }

    card.querySelector('[data-remove-char]')?.addEventListener('click', () => {
      removeCharacter(char.id);
    });

    container.appendChild(card);
  });
}

/**
 * Remove a character from the list
 * @param {string} charId
 */
function removeCharacter(charId) {
  const idx = state.characters.findIndex(c => c.id === charId);
  if (idx !== -1) state.characters.splice(idx, 1);
  renderCharacterList();
}

/**
 * Show status message in import area
 */
function showStatus(el, message, type) {
  if (!el) return;
  el.className = `import-status import-status-${type}`;
  el.innerHTML = message;
  el.classList.remove('hidden');
}

/**
 * Format modifier for display
 */
function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Return an array of attacks for a player character in the same format
 * used by parseMonsterAttacks() so the token info panel can render them.
 * @param {Object} charData
 * @returns {Array<{name:string, isAoe:boolean, hitBonus:number|null, damageDice:string[], damageTypes:string[]}>}
 */
export function getCharacterAttacks(charData) {
  if (!charData) return [];
  return (charData.attacks || []).map(atk => ({
    name: atk.name || 'Attack',
    isAoe: !!(atk.isAoe),
    hitBonus: atk.isAoe ? null : (atk.hitBonus ?? 0),
    damageDice: Array.isArray(atk.damageDice) ? atk.damageDice : [String(atk.damageDice || '1d4')],
    damageTypes: Array.isArray(atk.damageTypes) ? atk.damageTypes : [],
  }));
}

/**
 * Generate HTML string for a player character sheet (similar to monster statblock).
 * @param {Object} char
 * @returns {string}
 */
export function parseCharacterStatblock(char) {
  const strMod = getModifier(char.str || 10);
  const dexMod = getModifier(char.dex || 10);
  const conMod = getModifier(char.con || 10);
  const intMod = getModifier(char.int || 10);
  const wisMod = getModifier(char.wis || 10);
  const chaMod = getModifier(char.cha || 10);

  const prof = char.proficiencyBonus || getProficiencyBonus(char.level || 1);
  const saves = char.saveProficiencies || {};

  // Compute save bonus: raw mod + prof if proficient
  const getSaveBonus = (key, rawMod) => rawMod + (saves[key] ? prof : 0);

  const { mod: spellMod, ability: spellAbility } = getSpellcastingModifier(intMod, wisMod, chaMod);
  const perceptionMod = wisMod; // simplified — no full skill list stored
  const stealthMod = dexMod;

  const SAVE_ABILITIES = [
    { key: 'str', label: 'STR', mod: strMod },
    { key: 'dex', label: 'DEX', mod: dexMod },
    { key: 'con', label: 'CON', mod: conMod },
    { key: 'int', label: 'INT', mod: intMod },
    { key: 'wis', label: 'WIS', mod: wisMod },
    { key: 'cha', label: 'CHA', mod: chaMod },
  ];

  let html = `
    <div class="statblock">
      <div class="sb-creature-info">
        <p class="sb-type">${char.class || 'Adventurer'}${char.level ? ', Level ' + char.level : ''}</p>
        ${char.source ? `<p class="sb-source">Imported from: ${char.source}</p>` : ''}
      </div>
      <div class="sb-divider"></div>
      <div class="sb-core">
        <p><strong>Armor Class</strong> ${char.ac || 10}</p>
        <p><strong>Hit Points</strong> ${char.maxHp || 20}</p>
        ${char.proficiencyBonus ? `<p><strong>Proficiency Bonus</strong> +${char.proficiencyBonus}</p>` : ''}
      </div>
      <div class="sb-divider"></div>
      <div class="sb-ability-scores">`;

  const abilityPairs = [
    { name: 'STR', score: char.str || 10, mod: strMod },
    { name: 'DEX', score: char.dex || 10, mod: dexMod },
    { name: 'CON', score: char.con || 10, mod: conMod },
    { name: 'INT', score: char.int || 10, mod: intMod },
    { name: 'WIS', score: char.wis || 10, mod: wisMod },
    { name: 'CHA', score: char.cha || 10, mod: chaMod },
  ];

  abilityPairs.forEach(({ name, score, mod }) => {
    html += `
        <div class="sb-ability">
          <div class="sb-ability-name">${name}</div>
          <div class="sb-ability-val">${score}</div>
          <div class="sb-ability-mod">(${formatModifier(mod)})</div>
        </div>`;
  });

  html += `</div>
      <div class="sb-divider"></div>
      <div class="sb-saves">
        <div class="sb-saves-title">🎲 Saving Throws <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-saves-grid">`;

  SAVE_ABILITIES.forEach(({ key, label, mod }) => {
    const bonus = getSaveBonus(key, mod);
    const bonusStr = formatModifier(bonus);
    const isProficient = !!saves[key];
    html += `<button class="sb-save-roll sb-save-throw-btn${isProficient ? ' sb-save-proficient' : ''}" data-ability="${key}" data-mod="${bonus}" title="${label} saving throw: ${bonusStr}">
        <span class="sb-save-name">${label}</span>
        <span class="sb-save-mod">${bonusStr}</span>
      </button>`;
  });

  html += `</div>
        <div class="sb-save-result sb-saving-throw-result"></div>
      </div>
      <div class="sb-divider"></div>
      <div class="sb-skill-checks">
        <div class="sb-saves-title">🎯 Skill Checks <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-skill-checks-grid">
          <button class="sb-save-roll sb-skill-check" data-check="perception" data-mod="${perceptionMod}" title="Perception check (WIS): ${formatModifier(perceptionMod)}">
            <span class="sb-save-name">Percept.</span>
            <span class="sb-save-mod">${formatModifier(perceptionMod)}</span>
          </button>
          <button class="sb-save-roll sb-skill-check" data-check="stealth" data-mod="${stealthMod}" title="Stealth check (DEX): ${formatModifier(stealthMod)}">
            <span class="sb-save-name">Stealth</span>
            <span class="sb-save-mod">${formatModifier(stealthMod)}</span>
          </button>
          <button class="sb-save-roll sb-skill-check" data-check="spellcasting" data-mod="${spellMod}" title="Spellcasting (${spellAbility}): ${formatModifier(spellMod)}">
            <span class="sb-save-name">Spell.</span>
            <span class="sb-save-mod">${formatModifier(spellMod)}</span>
          </button>
        </div>
        <div class="sb-save-result sb-skill-result"></div>
      </div>`;

  // Attacks section
  const attacks = getCharacterAttacks(char);
  if (attacks.length > 0) {
    html += `<div class="sb-divider"></div>
      <div class="sb-attacks">
        <div class="sb-saves-title">⚔️ Attacks <span class="sb-saves-hint">(tap to roll)</span></div>
        <div class="sb-attack-list">`;

    attacks.forEach(atk => {
      const damageSummary = atk.damageDice.map((dice, i) => {
        const type = (atk.damageTypes || [])[i];
        return type ? `${dice} ${type}` : dice;
      }).join(' + ');
      html += `<div class="sb-attack-row">
          <div class="sb-attack-row-header">
            <span class="sb-attack-name" title="${atk.name}">${atk.name}</span>
            <div class="sb-attack-btns">`;

      if (!atk.isAoe) {
        html += `<button class="sb-atk-btn sb-atk-roll-btn" data-bonus="${atk.hitBonus}" title="${atk.name}: to hit">
                <span class="sb-atk-label">ATK</span>
                <span class="sb-atk-val">${formatModifier(atk.hitBonus)}</span>
              </button>`;
      }

      html += `<button class="sb-atk-btn sb-dmg-roll-btn" data-damage="${atk.damageDice.join('|')}" data-damage-types="${(atk.damageTypes || []).join('|')}" title="${atk.name}: ${damageSummary}">
              <span class="sb-atk-label">DMG</span>
              <span class="sb-atk-val">${damageSummary}</span>
            </button>`;

      html += `</div></div>
          <div class="sb-attack-row-results">`;
      if (!atk.isAoe) html += `<div class="sb-row-atk-result"></div>`;
      html += `<div class="sb-row-dmg-result"></div>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}
