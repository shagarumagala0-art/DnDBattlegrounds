/**
 * DnD Arena Pro — Attack Rolling Module
 */

import { state, changeTokenHp } from './state.js';
import { rollDice, showToast, getModifier } from './utils.js';
import { renderInitiativeList } from './combat.js';

// Callback for when HP changes so arena can re-render
let onAttackHitCb = null;
export function onAttackHit(fn) {
  onAttackHitCb = fn;
}

/** Maps full ability names (lowercase) to their 3-letter token property keys. */
const ABILITY_NAME_MAP = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

/** Maps 3-letter ability keys to their display labels. */
const ABILITY_LABEL_MAP = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

/**
 * Parse attack actions from a monster's action entries.
 * Returns both standard to-hit attacks ({@hit}) and saving throw actions ({@dc}).
 *
 * Standard attack: {name, isSaveAttack: false, toHit, damage}
 * Save attack:     {name, isSaveAttack: true, dc, saveAbility, damage, halfOnSave}
 *
 * @param {Object} monster
 * @returns {Array<Object>}
 */
export function parseMonsterAttacks(monster) {
  if (!monster || !monster.action) return [];

  const attacks = [];
  for (const action of monster.action) {
    const entryText = Array.isArray(action.entries)
      ? action.entries.map(e => (typeof e === 'string' ? e : JSON.stringify(e))).join(' ')
      : '';

    const hitMatch = entryText.match(/\{@hit\s+(-?\d+)\}/);
    const dmgMatch = entryText.match(/\{@damage\s+([^}]+)\}/);
    const dcMatch = entryText.match(/\{@dc\s+(\d+)\}/);
    const saveMatch = entryText.match(
      /(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving\s+throw/i
    );

    if (hitMatch) {
      // Standard attack roll action (may also reference a DC for secondary effects)
      attacks.push({
        name: action.name,
        isSaveAttack: false,
        toHit: parseInt(hitMatch[1], 10),
        damage: dmgMatch ? dmgMatch[1].trim() : '1d4',
      });
    } else if (dcMatch && saveMatch) {
      // Pure saving throw action — no attack roll, defender saves against attacker's DC
      const saveAbility = ABILITY_NAME_MAP[saveMatch[1].toLowerCase()] || 'str';
      const halfOnSave = /half\s+(as\s+much\s+)?damage/i.test(entryText);
      attacks.push({
        name: action.name,
        isSaveAttack: true,
        dc: parseInt(dcMatch[1], 10),
        saveAbility,
        damage: dmgMatch ? dmgMatch[1].trim() : '1d4',
        halfOnSave,
      });
    }
  }

  return attacks;
}

/**
 * Get a token's saving throw bonus for a given ability.
 * Uses the monster's explicit {@save} modifier when available,
 * otherwise falls back to the raw ability modifier.
 *
 * @param {Object} token
 * @param {string} ability - 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
 * @returns {number}
 */
export function getSaveBonus(token, ability) {
  if (token.monsterData && token.monsterData.save) {
    const saveVal = token.monsterData.save[ability];
    if (saveVal !== undefined && saveVal !== null) {
      const parsed = parseInt(String(saveVal).replace(/\s/g, ''), 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  // Fall back to ability modifier
  return getModifier(token[ability] || 10);
}

/**
 * Roll a saving throw action from attacker against target.
 * The target rolls d20 + their save bonus versus the attacker's DC.
 * Failed save → full damage; successful save → half damage (if halfOnSave) or none.
 *
 * @param {{name, dc, saveAbility, damage, halfOnSave}} attack
 * @param {Object} attackerToken
 * @param {Object} targetToken
 * @returns {{d20Roll, saveMod, total, dc, saved, damage, msg}}
 */
export function rollSavingThrowAttack(attack, attackerToken, targetToken) {
  const d20Roll = Math.floor(Math.random() * 20) + 1;
  const saveMod = getSaveBonus(targetToken, attack.saveAbility);
  const total = d20Roll + saveMod;
  const dc = attack.dc;
  const saved = total >= dc;
  const abilityLabel = ABILITY_LABEL_MAP[attack.saveAbility] || attack.saveAbility.toUpperCase();

  // Roll damage once; apply full damage on a failed save, half on a successful save
  const baseDamage = rollDice(attack.damage);
  let damageDealt = 0;
  if (!saved) {
    damageDealt = baseDamage;
  } else if (attack.halfOnSave) {
    damageDealt = Math.floor(baseDamage / 2);
  }

  if (damageDealt > 0) {
    const newHp = Math.max(0, targetToken.hp - damageDealt);
    targetToken.hp = newHp;
    const combatant = state.combatants.find(c => c.tokenId === targetToken.id);
    if (combatant) combatant.hp = newHp;
    if (onAttackHitCb) onAttackHitCb(targetToken);
  }

  const modStr = saveMod >= 0 ? `+${saveMod}` : `${saveMod}`;
  const savedLabel = saved
    ? `✅ <strong class="hit-label">Saved!</strong>`
    : `❌ <strong class="miss-label">Failed save!</strong>`;

  const dmgStr = damageDealt > 0
    ? ` — <span class="dmg-result">${damageDealt} damage</span>` +
      ` (${targetToken.name} → ${targetToken.hp}/${targetToken.maxHp} HP)`
    : saved && !attack.halfOnSave
      ? ` — <span class="dmg-result">No damage</span>`
      : '';

  const msg = `<strong>${attackerToken.name}</strong> uses <em>${attack.name}</em>: ` +
    `<strong>${targetToken.name}</strong> rolls ${abilityLabel} save — ` +
    `d20(${d20Roll})${modStr} = <strong>${total}</strong> vs DC ${dc} — ${savedLabel}${dmgStr}`;

  return { d20Roll, saveMod, total, dc, saved, damage: damageDealt, msg };
}

/**
 * Parse a to-hit string into a numeric modifier.
 * Accepts "+5", "-1", "5", or a dice notation like "1d4+2" (rolls it).
 * @param {string|number} toHitStr
 * @returns {number}
 */
export function parseToHit(toHitStr) {
  if (toHitStr === null || toHitStr === undefined || toHitStr === '') return 0;
  const str = String(toHitStr).trim().replace(/\s/g, '');
  const numMatch = str.match(/^([+-]?\d+)$/);
  if (numMatch) return parseInt(numMatch[1], 10);
  // Dice notation — evaluate as a bonus
  return rollDice(str);
}

/**
 * Roll an attack from attacker against target.
 * Auto-deducts HP from target if the attack hits.
 *
 * @param {{name: string, toHit: number|string, damage: string}} attack
 * @param {Object} attackerToken
 * @param {Object} targetToken
 * @returns {{d20Roll, toHitMod, total, targetAc, isCrit, isFumble, hit, damage, msg}}
 */
export function rollAttack(attack, attackerToken, targetToken) {
  const d20Roll = Math.floor(Math.random() * 20) + 1;
  const toHitMod = typeof attack.toHit === 'number'
    ? attack.toHit
    : parseToHit(String(attack.toHit));
  const total = d20Roll + toHitMod;
  const targetAc = targetToken.ac || 10;

  const isCrit = d20Roll === 20;
  const isFumble = d20Roll === 1;
  const hit = isCrit || (!isFumble && total >= targetAc);

  let damageDealt = 0;
  if (hit) {
    damageDealt = rollDice(attack.damage);
    if (isCrit) {
      // Critical hit: double the damage dice roll
      damageDealt += rollDice(attack.damage);
    }
    // Auto-deduct HP from target
    const newHp = Math.max(0, targetToken.hp - damageDealt);
    targetToken.hp = newHp;

    // Sync combatant record
    const combatant = state.combatants.find(c => c.tokenId === targetToken.id);
    if (combatant) combatant.hp = newHp;

    if (onAttackHitCb) onAttackHitCb(targetToken);
  }

  const modStr = toHitMod >= 0 ? `+${toHitMod}` : `${toHitMod}`;
  const hitLabel = isCrit
    ? '💥 <strong class="crit-label">Critical Hit!</strong>'
    : isFumble
      ? '💨 <strong class="fumble-label">Fumble!</strong>'
      : hit
        ? '✅ <strong class="hit-label">Hit!</strong>'
        : '❌ <strong class="miss-label">Miss!</strong>';
  const dmgStr = hit
    ? ` — <span class="dmg-result">${damageDealt} damage</span> (${targetToken.name} → ${Math.max(0, targetToken.hp)}/${targetToken.maxHp} HP)`
    : '';

  const msg = `<strong>${attackerToken.name}</strong> uses <em>${attack.name}</em>: ` +
    `d20(${d20Roll})${modStr} = <strong>${total}</strong> vs AC ${targetAc} — ${hitLabel}${dmgStr}`;

  return { d20Roll, toHitMod, total, targetAc, isCrit, isFumble, hit, damage: damageDealt, msg };
}

/**
 * Populate the attack panel dropdowns from current state.
 */
export function populateAttackPanel() {
  const attackerSel = document.getElementById('attack-attacker');
  const actionSel = document.getElementById('attack-action');
  const targetSel = document.getElementById('attack-target');

  if (!attackerSel || !actionSel || !targetSel) return;

  // Remember current selections
  const prevAttacker = attackerSel.value;
  const prevAction = actionSel.value;
  const prevTarget = targetSel.value;

  attackerSel.innerHTML = '<option value="">— Attacker —</option>';
  targetSel.innerHTML = '<option value="">— Target —</option>';

  state.tokens.forEach(token => {
    const opt = document.createElement('option');
    opt.value = token.id;
    opt.textContent = `${token.name} (HP:${token.hp}/${token.maxHp}, AC:${token.ac})`;
    if (token.hp <= 0) opt.disabled = true;
    attackerSel.appendChild(opt.cloneNode(true));
    targetSel.appendChild(opt);
  });

  // Restore previous values if still valid
  if (prevAttacker) attackerSel.value = prevAttacker;
  if (prevTarget) targetSel.value = prevTarget;

  // Repopulate actions based on current attacker, then restore action selection
  updateAttackActions(attackerSel.value);
  if (prevAction) actionSel.value = prevAction;
}

/**
 * Update the attack action dropdown based on the selected attacker token.
 * @param {string} tokenId
 */
export function updateAttackActions(tokenId) {
  const actionSel = document.getElementById('attack-action');
  if (!actionSel) return;

  actionSel.innerHTML = '<option value="">— Attack —</option>';

  if (!tokenId) return;

  const token = state.tokens.find(t => t.id === tokenId);
  if (!token) return;

  const attacks = getTokenAttacks(token);

  if (attacks.length === 0) {
    actionSel.innerHTML = '<option value="">No attacks available</option>';
    return;
  }

  attacks.forEach((atk, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    if (atk.isSaveAttack) {
      const abilityLabel = ABILITY_LABEL_MAP[atk.saveAbility] || atk.saveAbility.toUpperCase();
      opt.textContent = `${atk.name} (DC ${atk.dc} ${abilityLabel} save, ${atk.damage} dmg)`;
    } else {
      const numHit = parseToHit(atk.toHit);
      const modStr = numHit >= 0 ? `+${numHit}` : `${numHit}`;
      opt.textContent = `${atk.name} (${modStr} to hit, ${atk.damage} dmg)`;
    }
    actionSel.appendChild(opt);
  });
}

/**
 * Get all available attacks for a token (monster or player).
 * @param {Object} token
 * @returns {Array<{name, toHit, damage}>}
 */
export function getTokenAttacks(token) {
  if (token.type === 'monster' && token.monsterData) {
    return parseMonsterAttacks(token.monsterData);
  }

  // Player attacks
  const playerAttacks = token.characterData?.attacks || token.attacks || [];
  if (playerAttacks.length > 0) return playerAttacks;

  // Default fallback attack
  return [];
}

/**
 * Handle a roll-attack button click.
 * Reads attacker, action, and target from the panel selectors.
 */
export function handleRollAttack() {
  const attackerSel = document.getElementById('attack-attacker');
  const actionSel = document.getElementById('attack-action');
  const targetSel = document.getElementById('attack-target');
  const resultEl = document.getElementById('attack-result');

  if (!attackerSel || !actionSel || !targetSel || !resultEl) return;

  const attackerId = attackerSel.value;
  const actionIdx = actionSel.value;
  const targetId = targetSel.value;

  if (!attackerId) { showToast('⚠️ Select an attacker.', 'warning'); return; }
  if (actionIdx === '' || actionIdx === null) { showToast('⚠️ Select an attack.', 'warning'); return; }
  if (!targetId) { showToast('⚠️ Select a target.', 'warning'); return; }
  if (attackerId === targetId) { showToast('⚠️ Attacker and target must differ.', 'warning'); return; }

  const attackerToken = state.tokens.find(t => t.id === attackerId);
  const targetToken = state.tokens.find(t => t.id === targetId);

  if (!attackerToken || !targetToken) return;

  const attacks = getTokenAttacks(attackerToken);
  const attack = attacks[parseInt(actionIdx, 10)];
  if (!attack) return;

  const result = attack.isSaveAttack
    ? rollSavingThrowAttack(attack, attackerToken, targetToken)
    : rollAttack(attack, attackerToken, targetToken);

  const dealtDamage = attack.isSaveAttack ? result.damage > 0 : result.hit;

  resultEl.innerHTML = result.msg;
  // Reset to base classes (this removes any existing 'fade-out' class)
  resultEl.className = `attack-result ${dealtDamage ? 'attack-hit' : 'attack-miss'}`;
  // Force a reflow so the browser processes the class removal before re-adding
  // 'fade-out', which restarts the CSS animation from the beginning
  void resultEl.offsetWidth;
  resultEl.classList.add('fade-out');

  renderInitiativeList();

  if (targetToken.hp <= 0 && dealtDamage) {
    showToast(`☠️ ${targetToken.name} has fallen!`, 'warning', 3000);
  }
}
