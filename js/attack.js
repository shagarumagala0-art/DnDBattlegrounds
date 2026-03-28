/**
 * DnD Arena Pro — Attack Rolling Module
 */

import { state, changeTokenHp } from './state.js';
import { rollDice, showToast } from './utils.js';
import { renderInitiativeList } from './combat.js';

// Callback for when HP changes so arena can re-render
let onAttackHitCb = null;
export function onAttackHit(fn) {
  onAttackHitCb = fn;
}

/**
 * Parse attack actions from a monster's action entries.
 * Extracts to-hit bonus and damage from {@hit X} / {@damage XdY+Z} tags.
 * @param {Object} monster
 * @returns {Array<{name, toHit, damage}>}
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

    if (hitMatch || dmgMatch) {
      attacks.push({
        name: action.name,
        toHit: hitMatch ? parseInt(hitMatch[1], 10) : 0,
        damage: dmgMatch ? dmgMatch[1].trim() : '1d4',
      });
    }
  }

  return attacks;
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
    const numHit = parseToHit(atk.toHit);
    const modStr = numHit >= 0 ? `+${numHit}` : `${numHit}`;
    opt.textContent = `${atk.name} (${modStr} to hit, ${atk.damage} dmg)`;
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

  const result = rollAttack(attack, attackerToken, targetToken);

  resultEl.innerHTML = result.msg;
  resultEl.className = `attack-result ${result.hit ? 'attack-hit' : 'attack-miss'}`;
  resultEl.classList.remove('hidden');

  renderInitiativeList();

  if (result.hit && targetToken.hp <= 0) {
    showToast(`☠️ ${targetToken.name} has fallen!`, 'warning', 3000);
  }
}
