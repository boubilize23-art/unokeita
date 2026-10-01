/**
 * ==========================================================
 *  MOTEUR DE REGLES  —  UNO STACK
 *  Source unique de verite, partagee par /server et /client.
 *  Aucune fonction ne contient d'effet de bord : tout est pur,
 *  ce qui rend chaque regle testable isolement.
 * ==========================================================
 *
 *  Les fonctions exportees attendues par le cahier des charges :
 *    canPlayCard()            carte unitaire
 *    canPlayMultipleCards()   combinaison complete
 *    canStackPenalty()        cumul hierarchique +2 < +4 < +8 < +10
 *    calculatePenalty()       somme des penalites d'un coup
 *    canPlaySameNumberGroup() groupe de memes numeros
 *    drawPenalty()            resolution d'une pile qu'on ne peut pas suivre
 *    isValidTurn()            validation complete d'un tour
 */

import { COLORS, DEFAULT_CONFIG, PENALTY_RANK, PENALTY_VALUES } from './constants.js';
import {
  cardLabel,
  isAction,
  isNumber,
  isPenalty,
  isWild,
  penaltyValue,
} from './cards.js';

export const OK = (extra = {}) => ({ ok: true, reason: null, ...extra });
export const KO = (reason, extra = {}) => ({ ok: false, reason, ...extra });

const NOM_COULEUR = { red: 'rouge', yellow: 'jaune', green: 'vert', blue: 'bleu' };

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

/** Contexte de reference minimal attendu par les fonctions. */
export function createContext({
  topCard = null,
  activeColor = null,
  pendingPenalty = null, // { total, lastValue }
  config = DEFAULT_CONFIG,
  hand = [],
} = {}) {
  return { topCard, activeColor, pendingPenalty, config: { ...DEFAULT_CONFIG, ...config }, hand };
}

/** La carte partage-t-elle la couleur active ? (indispensable apres un joker) */
function matchActiveColor(card, ctx) {
  if (!card || isWild(card)) return false;
  return !!ctx.activeColor && card.color === ctx.activeColor;
}

/** Raison pour laquelle une carte unitaire est jouable (ou non). */
function unitReason(card, ctx) {
  if (!card) return 'Carte introuvable.';

  // 1) Une pile de penalite est en cours : seule une penalite >= valeur posee est acceptee.
  if (ctx.pendingPenalty && ctx.pendingPenalty.total > 0) {
    if (!isPenalty(card)) {
      return `Une pénalité de ${ctx.pendingPenalty.total} cartes est en cours : réponds avec une carte +${ctx.pendingPenalty.lastValue} ou supérieure.`;
    }
    if (ctx.config.penaltyMustStackEqualOrHigher !== false) {
      const rank = PENALTY_RANK[card.value] ?? -1;
      const need = PENALTY_RANK[ctx.pendingPenalty.lastValue] ?? 0;
      if (rank < need) {
        return `Cumul interdit : +${card.value} est inférieur à la dernière pénalité (+${ctx.pendingPenalty.lastValue}).`;
      }
    }
    return null;
  }

  // 2) Aucun cumul en cours.
  if (isWild(card)) {
    return ctx.config.allowWild === false ? 'Les jokers sont désactivés dans cette partie.' : null;
  }

  if (isPenalty(card)) {
    if (ctx.config.penaltyRequiresColorMatch) {
      return matchActiveColor(card, ctx)
        ? null
        : `Cette carte ne peut pas être posée : la couleur ${NOM_COULEUR[ctx.activeColor] ?? ctx.activeColor} est requise.`;
    }
    return null; // une penalite ouvre toujours une chaine
  }

  if (matchActiveColor(card, ctx)) return null;

  if (isNumber(card) && isNumber(ctx.topCard) && card.value === ctx.topCard.value) return null;

  if (isAction(card)) {
    return `Carte d'action : seule la couleur ${NOM_COULEUR[ctx.activeColor] ?? ctx.activeColor} est acceptée.`;
  }

  return `Cette carte ne correspond ni à la couleur (${NOM_COULEUR[ctx.activeColor] ?? ctx.activeColor}) ni au numéro du dessus.`;
}

/* ------------------------------------------------------------------ *
 *  1. canPlayCard — carte unitaire
 * ------------------------------------------------------------------ */
export function canPlayCard(card, ctx) {
  const reason = unitReason(card, ctx);
  if (reason) return KO(reason);
  return OK({ effects: effectsOf([card], ctx) });
}

/* ------------------------------------------------------------------ *
 *  5. canPlaySameNumberGroup — groupe de memes numeros
 * ------------------------------------------------------------------ */
export function canPlaySameNumberGroup(cards, ctx) {
  if (!Array.isArray(cards) || cards.length < 2) {
    return KO('Un groupe de mêmes numéros contient au moins deux cartes.');
  }
  if (!cards.every(isNumber)) {
    return KO('Seules les cartes numériques peuvent être jouées en groupe de mêmes numéros.');
  }
  const first = cards[0].value;
  if (!cards.every((c) => c.value === first)) {
    return KO(
      `Groupe invalide : le groupe contient des numéros différents (${cards.map((c) => c.value).join(', ')}).`,
    );
  }
  const colorOk = cards.some((c) => matchActiveColor(c, ctx));
  const numberOk = isNumber(ctx.topCard) && ctx.topCard.value === first;
  if (!colorOk && !numberOk) {
    return KO(
      `Groupe invalide : il vous faut au moins un ${first} de couleur ${NOM_COULEUR[ctx.activeColor] ?? ctx.activeColor}, ou un ${first} comme sur la carte du dessus.`,
    );
  }
  return OK({ group: 'same-number', value: first });
}

/* ------------------------------------------------------------------ *
 *  7. canStackPenalty — hierarchie +2 < +4 < +8 < +10
 * ------------------------------------------------------------------ */
export function canStackPenalty(cards, ctx) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return KO('Aucune carte de pénalité fournie.');
  }
  if (!cards.every(isPenalty)) {
    return KO('Une réponse à une pénalité doit être composée uniquement de cartes de pénalité.');
  }
  const values = cards.map((c) => Number(c.value));
  const invalid = values.find((v) => !PENALTY_VALUES.includes(v));
  if (invalid !== undefined) {
    return KO(`Valeur de pénalité inconnue : +${invalid}.`);
  }

  const pending = ctx.pendingPenalty;
  if (pending && pending.total > 0 && ctx.config.penaltyMustStackEqualOrHigher !== false) {
    const need = PENALTY_RANK[pending.lastValue] ?? 0;
    const tooLow = values.filter((v) => (PENALTY_RANK[v] ?? -1) < need);
    if (tooLow.length > 0) {
      return KO(
        `Cumul interdit : +${[...new Set(tooLow)].join(' + ')} ne peut pas répondre à un +${pending.lastValue}. Ordre : +2 < +4 < +8 < +10.`,
      );
    }
  }

  return OK({
    group: 'penalty',
    total: values.reduce((a, b) => a + b, 0),
    lastValue: Math.max(...values),
  });
}

/* ------------------------------------------------------------------ *
 *  9. canPlayMultipleCards — validation de la combinaison complete
 * ------------------------------------------------------------------ */
export function canPlayMultipleCards(cards, ctx) {
  if (!Array.isArray(cards) || cards.length === 0) return KO('Sélectionnez au moins une carte.');
  const max = ctx.config.maxCardsPerPlay ?? Infinity;
  if (cards.length > max) {
    return KO(`Vous pouvez poser au maximum ${max} cartes en une action (sélection : ${cards.length}).`);
  }

  // Piles de penalite en cours : tout doit etre penalite.
  if (ctx.pendingPenalty && ctx.pendingPenalty.total > 0) {
    const res = canStackPenalty(cards, ctx);
    if (!res.ok) return res;
    return OK({ ...res, effects: effectsOf(cards, ctx) });
  }

  if (cards.length === 1) return canPlayCard(cards[0], ctx);

  // Joker(s)
  if (cards.every(isWild)) {
    if (ctx.config.allowWild === false) return KO('Les jokers sont désactivés dans cette partie.');
    return OK({ group: 'wild', effects: effectsOf(cards, ctx) });
  }
  if (cards.some(isWild)) {
    return KO('Un joker se joue seul, il ne peut pas être mélangé à d’autres cartes.');
  }

  // Groupe de penalites
  if (cards.every(isPenalty)) {
    const res = canStackPenalty(cards, ctx);
    if (!res.ok) return res;
    return OK({ ...res, effects: effectsOf(cards, ctx) });
  }

  // Groupe de memes numeros
  if (cards.every(isNumber)) {
    const res = canPlaySameNumberGroup(cards, ctx);
    if (!res.ok) return res;
    return OK({ ...res, effects: effectsOf(cards, ctx) });
  }

  // Melange interdit
  if (cards.some(isNumber) && cards.some(isPenalty)) {
    return KO('Mélange interdit : on ne combine pas un numéro et une pénalité dans la même action.');
  }
  if (cards.some(isAction)) {
    return KO('Une carte d’action doit se jouer seule.');
  }
  return KO('Cette combinaison n’est pas autorisée.');
}

/* ------------------------------------------------------------------ *
 *  10. calculatePenalty
 * ------------------------------------------------------------------ */
export function calculatePenalty(cards) {
  if (!Array.isArray(cards)) return 0;
  return cards.reduce((sum, c) => sum + penaltyValue(c), 0);
}

/**
 * Cumul total en cours apres application d'un coup.
 * Retourne { total, lastValue } (lastValue = la plus forte carte posee).
 */
export function accumulatePenalty(currentTotal, cards) {
  const delta = calculatePenalty(cards);
  const values = (cards || []).filter(isPenalty).map((c) => Number(c.value));
  const lastValue = values.length ? Math.max(...values) : null;
  const total = (currentTotal || 0) + delta;
  if (total === 0) return { total: 0, lastValue: null };
  // le seuil de reponse suit toujours la derniere carte posee
  return { total, lastValue: lastValue ?? null };
}

/* ------------------------------------------------------------------ *
 *  13. drawPenalty — resolution d'une pile non suivie
 * ------------------------------------------------------------------ */
export function drawPenalty(pendingPenalty) {
  const total = pendingPenalty?.total ?? 0;
  return {
    amount: total,
    nextTotal: 0,
    nextLastValue: null,
    label: total > 0 ? `+${total}` : '0',
  };
}

/* ------------------------------------------------------------------ *
 *  Effets d'un coup (couleur resultante, skip, reverse)
 * ------------------------------------------------------------------ */
function effectsOf(cards, ctx) {
  const colors = [...new Set(cards.filter((c) => !isWild(c)).map((c) => c.color))];
  const isWildPlay = cards.some(isWild);
  const penalty = calculatePenalty(cards);
  const skip = cards.some((c) => isAction(c) && c.value === 'skip') && ctx.config.allowSkipAction !== false;
  const reverse = cards.some((c) => isAction(c) && c.value === 'reverse') && ctx.config.allowReverseAction !== false;
  const colorOptions = isWildPlay ? [...COLORS] : colors;
  return {
    penalty,
    colorOptions,
    defaultColor: colorOptions[0] ?? ctx.activeColor,
    skip: penalty === 0 ? skip : false,
    reverse: penalty === 0 ? reverse : false,
    wild: isWildPlay,
  };
}

/* ------------------------------------------------------------------ *
 *  21. isValidTurn — le point d'entree unique du moteur
 * ------------------------------------------------------------------ */
export function isValidTurn(cards, ctx, chosenColor = undefined) {
  const base = canPlayMultipleCards(cards, ctx);
  if (!base.ok) return base;

  const effects = base.effects || effectsOf(cards, ctx);
  const colorOptions = effects.colorOptions || [];

  let color = effects.defaultColor ?? ctx.activeColor;
  if (chosenColor !== undefined && chosenColor !== null) {
    if (!colorOptions.includes(chosenColor)) {
      return KO(
        colorOptions.length
          ? `Couleur invalide. Couleurs disponibles : ${colorOptions.join(', ')}.`
          : 'Cette action ne définit pas de couleur.',
      );
    }
    color = chosenColor;
  }

  return OK({
    group: base.group ?? 'single',
    penalty: effects.penalty,
    nextColor: color,
    colorOptions,
    nextLastValue: base.lastValue ?? null,
    skipNext: effects.skip,
    reverse: effects.reverse,
    wild: effects.wild,
    label: cards.map((c) => cardLabel(c)).join(' + '),
  });
}

/* ------------------------------------------------------------------ *
 *  Utilitaires pour l'interface
 * ------------------------------------------------------------------ */

/** Cartes jouables une par une (pour surligner la main). */
export function getPlayableCards(hand, ctx) {
  return (hand || []).filter((c) => canPlayCard(c, ctx).ok);
}

/** Existe-t-il au moins une combinaison multi-cartes jouable dans la main ? */
export function findPlayableGroups(hand, ctx, maxSize = 5) {
  const groups = [];
  const penaltyGroup = (hand || []).filter((c) => isPenalty(c) && canStackPenalty([c], ctx).ok);
  if (penaltyGroup.length >= 2) groups.push(penaltyGroup);

  const byNumber = new Map();
  for (const c of hand || []) {
    if (!isNumber(c)) continue;
    if (!byNumber.has(c.value)) byNumber.set(c.value, []);
    byNumber.get(c.value).push(c);
  }
  for (const [value, cards] of byNumber) {
    if (cards.length >= 2) {
      const slice = cards.slice(0, Math.min(maxSize, cards.length));
      if (canPlaySameNumberGroup(slice, ctx).ok) groups.push(slice);
    }
  }
  return groups;
}

/** Le joueur a-t-il une reponse possible a la pile en cours ? */
export function canRespondToPenalty(hand, ctx) {
  if (!ctx.pendingPenalty || ctx.pendingPenalty.total <= 0) return true;
  return (hand || []).some((c) => isPenalty(c) && canStackPenalty([c], ctx).ok);
}

/** Nombre de cartes qu'il faut piocher si le joueur abandonne la pile. */
export function pendingDrawAmount(ctx) {
  return ctx.pendingPenalty?.total ?? 0;
}

/** Petit resume textuel du coup (utile pour le journal et les tests). */
export function explainSelection(cards, ctx) {
  const res = isValidTurn(cards, ctx);
  if (!res.ok) return res;
  const parts = [res.label];
  if (res.penalty > 0) parts.push(`pénalité +${res.penalty}`);
  if (res.group === 'same-number') parts.push(`groupe de ${cards[0].value}`);
  if (res.wild) parts.push('joker');
  return OK({ text: parts.join(' — ') });
}