/**
 * Modele de carte + generation de la pioche.
 * Une carte = { id, color, kind, value }
 *   kind 'number' -> value 1..10
 *   kind 'penalty' -> value 2|4|8|10  (le "+" est implicite)
 *   kind 'action'  -> value 'skip' | 'reverse'
 *   kind 'wild'    -> color 'wild', aucune valeur
 */

import { COLORS, PENALTY_VALUES, WILD, DEFAULT_CONFIG } from './constants.js';

let counter = 0;
export function makeCardId(prefix = 'c') {
  counter += 1;
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createCard(color, kind, value, id) {
  return { id: id ?? makeCardId(), color, kind, value };
}

export function isPenalty(card) {
  return !!card && card.kind === 'penalty';
}
export function isWild(card) {
  return !!card && (card.kind === 'wild' || card.color === WILD);
}
export function isNumber(card) {
  return !!card && card.kind === 'number';
}
export function isAction(card) {
  return !!card && card.kind === 'action';
}

/** Valeur d'une carte de penalite, 0 sinon. */
export function penaltyValue(card) {
  return isPenalty(card) ? Number(card.value) : 0;
}

/**
 * Deux cartes partagent-elles la meme couleur utile ?
 * Un joker n'a pas de couleur : il ne "colle" a rien.
 */
export function sameColor(a, b) {
  if (!a || !b) return false;
  if (isWild(a) || isWild(b)) return false;
  return a.color === b.color;
}

export function cardLabel(card) {
  if (!card) return '?';
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'penalty':
      return `+${card.value}`;
    case 'action':
      return card.value === 'skip' ? 'PASS' : 'RETOUR';
    case 'wild':
    default:
      return 'JOKER';
  }
}

export function cardSymbol(card) {
  if (!card) return '';
  switch (card.kind) {
    case 'number':
      return String(card.value);
    case 'penalty':
      return `+${card.value}`;
    case 'action':
      return card.value === 'skip' ? '\u21e0' : '\u21ba';
    case 'wild':
    default:
      return '\u2605';
  }
}

export function describeCard(card) {
  if (!card) return 'carte inconnue';
  if (isWild(card)) return 'Joker (choix de couleur)';
  const colorName = { red: 'Rouge', yellow: 'Jaune', green: 'Vert', blue: 'Bleu' }[card.color] || card.color;
  if (isPenalty(card)) return `+${card.value} ${colorName}`;
  if (isAction(card)) return `${cardLabel(card)} ${colorName}`;
  return `${card.value} ${colorName}`;
}

/**
 * Construit une pioche complete selon la configuration.
 * 4 couleurs x (nombres + actions + 4 penalites) x copies, + jokers.
 */
export function createDeck(config = DEFAULT_CONFIG) {
  const copies = config.deckCopies ?? 2;
  const { min, max } = config.numbers ?? { min: 1, max: 10 };
  const deck = [];

  for (const color of COLORS) {
    for (let v = min; v <= max; v += 1) {
      for (let c = 0; c < copies; c += 1) deck.push(createCard(color, 'number', v));
    }
    for (const p of PENALTY_VALUES) {
      for (let c = 0; c < copies; c += 1) deck.push(createCard(color, 'penalty', p));
    }
    if (config.allowSkipAction !== false) {
      for (let c = 0; c < copies; c += 1) deck.push(createCard(color, 'action', 'skip'));
    }
    if (config.allowReverseAction !== false) {
      for (let c = 0; c < copies; c += 1) deck.push(createCard(color, 'action', 'reverse'));
    }
  }

  if (config.allowWild !== false) {
    const wilds = config.wildCopies ?? 4;
    for (let c = 0; c < wilds; c += 1) deck.push(createCard(WILD, 'wild', 'wild'));
  }

  return deck;
}

/** Melange Fisher-Yates, RNG injectable pour des tests deterministes. */
export function shuffle(deck, rng = Math.random) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function countByValue(hand) {
  const out = {};
  for (const c of hand) {
    const key = `${c.color}-${c.kind}-${c.value}`;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}
