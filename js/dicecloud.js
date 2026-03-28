import { state } from './state.js';
import { generateId, getAbbr, getModifier, showToast } from './utils.js';

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
    level: data.level?.value || 1,
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
    color: 'player',
    monsterData: null,
    attacks: charData.attacks || [],
    characterData: charData,
  };
}

/**
 * Create a manual player token from the custom player form
 * @param {Object} formData
 * @returns {Object}
 */
export function createManualCharacter(formData) {
  // Build attacks array from to-hit / damage fields
  const attacks = [];
  const toHit = (formData.toHit || '').toString().trim();
  const damage = (formData.damage || '').toString().trim();
  if (toHit || damage) {
    attacks.push({
      name: 'Attack',
      toHit: toHit || '0',
      damage: damage || '1d4',
    });
  }

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
    attacks,
    manual: true,
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
        <p class="empty-hint">Import from DiceCloud or add a custom player above.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  state.characters.forEach(char => {
    const tokenOnGrid = state.tokens.find(t => t.characterData?.id === char.id || t.id === char.tokenId);
    const isOnGrid = !!tokenOnGrid;

    const card = document.createElement('div');
    card.className = 'character-card';
    card.innerHTML = `
      <div class="char-badge">${getAbbr(char.name)}</div>
      <div class="char-details">
        <div class="char-name">${char.name}</div>
        <div class="char-stats">
          <span>HP: ${char.maxHp}</span>
          <span>AC: ${char.ac}</span>
          <span>DEX: ${char.dex} (${formatMod(getModifier(char.dex))})</span>
        </div>
      </div>
      <div class="char-actions">
        ${isOnGrid
          ? `<span class="on-grid-badge">On Grid</span>`
          : `<button class="btn btn-sm btn-primary" data-char-id="${char.id}">⚔️ To Arena</button>`
        }
        <button class="btn btn-sm btn-danger" data-remove-char="${char.id}">✕</button>
      </div>
    `;

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
