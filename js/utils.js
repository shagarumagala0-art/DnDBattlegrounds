/**
 * Parse 5etools markup tags to readable HTML
 * @param {string} text - Raw 5etools text
 * @returns {string} - HTML string
 */
export function parse5etools(text) {
  if (!text) return '';
  let result = String(text);

  result = result.replace(/\{@atk\s+[^}]+\}/g, '<em class="atk-label">Attack:</em>');
  result = result.replace(/\{@hit\s+(-?\d+)\}/g, (_, n) => {
    const num = parseInt(n);
    return `<strong>${num >= 0 ? '+' : ''}${num}</strong>`;
  });
  result = result.replace(/\{@h\}/g, '<strong class="hit-label">Hit:</strong> ');
  result = result.replace(/\{@damage\s+([^}]+)\}/g, (_, dmg) => `<strong class="damage-val">${dmg}</strong>`);
  result = result.replace(/\{@dice\s+([^}]+)\}/g, (_, dice) => `<span class="dice-notation">${dice}</span>`);
  result = result.replace(/\{@dc\s+(\d+)\}/g, (_, dc) => `<strong>DC ${dc}</strong>`);
  result = result.replace(/\{@condition\s+([^}|]+)(\|[^}]*)?\}/g, (_, cond) => `<em class="condition">${cond}</em>`);
  result = result.replace(/\{@spell\s+([^}|]+)(\|[^}]*)?\}/g, (_, spell) => `<em class="spell-name">${spell}</em>`);
  result = result.replace(/\{@creature\s+([^}|]+)(\|[^}]*)?\}/g, (_, creature) => `<em>${creature}</em>`);
  result = result.replace(/\{@b\s+([^}]+)\}/g, (_, t) => `<strong>${t}</strong>`);
  result = result.replace(/\{@i\s+([^}]+)\}/g, (_, t) => `<em>${t}</em>`);
  result = result.replace(/\{@skill\s+([^}|]+)(\|[^}]*)?\}/g, (_, skill) => skill);
  result = result.replace(/\{@item\s+([^}|]+)(\|[^}]*)?\}/g, (_, item) => item);
  result = result.replace(/\{@action\s+([^}|]+)(\|[^}]*)?\}/g, (_, action) => action);
  result = result.replace(/\{@[^}]+\}/g, (match) => {
    const inner = match.slice(2, -1);
    const parts = inner.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  });

  return result;
}

/**
 * Roll dice notation, e.g. "2d6+3", "1d8-1", "3d4"
 * @param {string|number} notation
 * @returns {number}
 */
export function rollDice(notation) {
  if (notation === null || notation === undefined) return 0;
  const str = String(notation).trim().toLowerCase().replace(/\s/g, '');
  const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);

  if (!match) {
    const fixed = parseInt(str);
    return isNaN(fixed) ? 0 : fixed;
  }

  const numDice = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const modifier = match[3] ? parseInt(match[3]) : 0;

  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total + modifier;
}

/**
 * Roll d20 with optional modifier
 * @param {number} mod
 * @returns {{roll: number, mod: number, total: number, display: string}}
 */
export function rollD20(mod = 0) {
  const roll = Math.floor(Math.random() * 20) + 1;
  const total = roll + mod;
  const modStr = mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '';
  return {
    roll,
    mod,
    total,
    display: `${roll}${modStr} = ${total}`
  };
}

/**
 * Get the spellcasting ability modifier (highest of INT, WIS, CHA).
 * Tie-breaking priority: INT > WIS > CHA.
 * @param {number} intMod
 * @param {number} wisMod
 * @param {number} chaMod
 * @returns {{ mod: number, ability: string }}
 */
export function getSpellcastingModifier(intMod, wisMod, chaMod) {
  const mod = Math.max(intMod, wisMod, chaMod);
  const ability = intMod >= wisMod && intMod >= chaMod ? 'INT'
    : wisMod >= chaMod ? 'WIS' : 'CHA';
  return { mod, ability };
}

/**
 * Convert ability score to modifier
 * @param {number} score
 * @returns {number}
 */
export function getModifier(score) {
  return Math.floor(((score || 10) - 10) / 2);
}

/**
 * Format modifier with +/- sign
 * @param {number} mod
 * @returns {string}
 */
export function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Parse CR string to float
 * @param {string|number|object} cr
 * @returns {number}
 */
export function parseCR(cr) {
  if (cr === null || cr === undefined) return 0;
  if (typeof cr === 'object' && cr.cr !== undefined) return parseCR(cr.cr);
  const str = String(cr);
  if (str === '1/8') return 0.125;
  if (str === '1/4') return 0.25;
  if (str === '1/2') return 0.5;
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Format CR for display
 * @param {string|number|object} cr
 * @returns {string}
 */
export function formatCR(cr) {
  if (cr === null || cr === undefined) return '—';
  if (typeof cr === 'object' && cr.cr !== undefined) return String(cr.cr);
  return String(cr);
}

/**
 * Generate unique ID
 * @returns {string}
 */
export function generateId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get 3-char abbreviation from name
 * @param {string} name
 * @returns {string}
 */
export function getAbbr(name) {
  if (!name) return '???';
  const words = name.trim().split(/\s+/);
  if (words.length >= 3) {
    return (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
  } else if (words.length === 2) {
    return (words[0].slice(0, 2) + words[1][0]).toUpperCase();
  }
  return name.slice(0, 3).toUpperCase();
}

/**
 * Clamp number between min and max
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Get HP color class based on percentage
 */
export function getHpColorClass(current, max) {
  if (!max || max <= 0) return 'hp-full';
  const pct = current / max;
  if (pct > 0.6) return 'hp-full';
  if (pct > 0.3) return 'hp-medium';
  if (pct > 0) return 'hp-low';
  return 'hp-dead';
}

/**
 * Get average HP from 5etools HP object
 */
export function getAverageHp(hpObj) {
  if (!hpObj) return 10;
  if (typeof hpObj === 'number') return hpObj;
  if (hpObj.average) return hpObj.average;
  if (hpObj.formula) return rollDice(hpObj.formula.replace(/\s/g, '')) || 10;
  return 10;
}

/**
 * Get numeric AC from 5etools AC array or value
 */
export function getAcValue(acArr) {
  if (!acArr) return 10;
  if (typeof acArr === 'number') return acArr;
  if (Array.isArray(acArr)) {
    const first = acArr[0];
    if (typeof first === 'number') return first;
    if (first && typeof first === 'object') return first.ac || 10;
  }
  return 10;
}

/**
 * Get monster type string from 5etools type field
 */
export function getMonsterType(typeObj) {
  if (!typeObj) return 'unknown';
  if (typeof typeObj === 'string') return typeObj;
  if (typeObj.type) return typeObj.type;
  return 'unknown';
}

/**
 * Show a toast notification
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }, duration);
}

/**
 * Format speed object for display
 */
export function formatSpeed(speedObj) {
  if (!speedObj) return '30 ft.';
  if (typeof speedObj === 'number') return `${speedObj} ft.`;
  const parts = [];
  if (speedObj.walk !== undefined) parts.push(`${speedObj.walk} ft.`);
  if (speedObj.fly) parts.push(`fly ${speedObj.fly} ft.`);
  if (speedObj.swim) parts.push(`swim ${speedObj.swim} ft.`);
  if (speedObj.climb) parts.push(`climb ${speedObj.climb} ft.`);
  if (speedObj.burrow) parts.push(`burrow ${speedObj.burrow} ft.`);
  return parts.join(', ') || '30 ft.';
}

/**
 * Format alignment array/string for display
 */
export function formatAlignment(alignment) {
  if (!alignment) return 'unaligned';
  if (typeof alignment === 'string') return alignment;
  if (Array.isArray(alignment)) {
    const map = {
      LG: 'lawful good', NG: 'neutral good', CG: 'chaotic good',
      LN: 'lawful neutral', N: 'neutral', TN: 'true neutral',
      CN: 'chaotic neutral', LE: 'lawful evil', NE: 'neutral evil', CE: 'chaotic evil',
      'lawful good': 'lawful good', 'neutral good': 'neutral good',
      'chaotic good': 'chaotic good', 'neutral': 'neutral',
      'unaligned': 'unaligned'
    };
    const joined = alignment.join(' ');
    return map[joined] || joined.toLowerCase();
  }
  return 'unaligned';
}

/**
 * Format size letter to full word
 */
export function formatSize(sizeArr) {
  const map = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
  if (!sizeArr) return 'Medium';
  if (Array.isArray(sizeArr)) return map[sizeArr[0]] || sizeArr[0];
  return map[sizeArr] || sizeArr;
}
