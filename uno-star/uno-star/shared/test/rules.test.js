import { describe, expect, it } from 'vitest';
import {
  accumulatePenalty,
  canPlayCard,
  canPlayMultipleCards,
  canPlaySameNumberGroup,
  canRespondToPenalty,
  canStackPenalty,
  calculatePenalty,
  createContext,
  drawPenalty,
  findPlayableGroups,
  getPlayableCards,
  isValidTurn,
} from '../src/rules.js';
import { createCard, createDeck } from '../src/cards.js';

const num = (color, value) => createCard(color, 'number', value);
const pen = (color, value) => createCard(color, 'penalty', value);
const wild = () => createCard('wild', 'wild', 'wild');

/** Contexte : carte du dessus BLEU 2, couleur active bleue, aucune penalite en cours. */
const baseCtx = (over = {}) =>
  createContext({
    topCard: num('blue', 2),
    activeColor: 'blue',
    pendingPenalty: null,
    config: {},
    ...over,
  });

describe('1-5. hiérarchie des pénalités (+2 < +4 < +8 < +10)', () => {
  const cases = [
    { nom: '+2 sur +2', lastValue: 2, reponse: 2, ok: true, total: 4 },
    { nom: '+2 sur +4', lastValue: 2, reponse: 4, ok: true, total: 6 },
    { nom: '+4 sur +4', lastValue: 4, reponse: 4, ok: true, total: 8 },
    { nom: '+4 sur +8', lastValue: 4, reponse: 8, ok: true, total: 12 },
    { nom: '+8 sur +10', lastValue: 8, reponse: 10, ok: true, total: 18 },
    { nom: '+4 sur +2 (interdit)', lastValue: 4, reponse: 2, ok: false, total: 6 },
    { nom: '+10 sur +8 (interdit)', lastValue: 8, reponse: 4, ok: false, total: 12 },
  ];

  for (const c of cases) {
    it(`${c.nom} → ${c.ok ? 'autorisé' : 'refusé'}`, () => {
      const ctx = baseCtx({
        topCard: pen('blue', c.lastValue),
        pendingPenalty: { total: c.lastValue, lastValue: c.lastValue },
      });
      const carte = pen('red', c.reponse);
      const res = canStackPenalty([carte], ctx);
      expect(res.ok).toBe(c.ok);
      if (!c.ok) {
        expect(res.reason).toMatch(/Cumul interdit/i);
      } else {
        const acc = accumulatePenalty(c.lastValue, [carte]);
        expect(acc.total).toBe(c.total);
        expect(acc.lastValue).toBe(c.reponse);
      }
    });
  }

  it('refuse une carte numérique en réponse à une pénalité', () => {
    const ctx = baseCtx({ pendingPenalty: { total: 2, lastValue: 2 } });
    const res = canPlayCard(num('blue', 7), ctx);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/pénalité/i);
  });

  it('chaîne complète +2 → +4 → +8 = 14', () => {
    let ctx = baseCtx();
    let total = 0;
    let lastValue = null;
    for (const v of [2, 4, 8]) {
      const res = isValidTurn([pen('green', v)], ctx);
      expect(res.ok).toBe(true);
      const acc = accumulatePenalty(total, [pen('green', v)]);
      total = acc.total;
      lastValue = acc.lastValue;
      ctx = baseCtx({
        topCard: pen('green', v),
        pendingPenalty: { total, lastValue },
      });
    }
    expect(total).toBe(14);
    expect(lastValue).toBe(8);
    // le joueur suivant ne peut plus répondre avec un +4
    expect(canStackPenalty([pen('red', 4)], ctx).ok).toBe(false);
  });
});

describe('6-9. combinaisons de pénalités', () => {
  it('plusieurs +2 simultanément → cumul 6', () => {
    const group = [pen('red', 2), pen('blue', 2), pen('green', 2)];
    const res = canPlayMultipleCards(group, baseCtx());
    expect(res.ok).toBe(true);
    expect(calculatePenalty(group)).toBe(6);
    expect(res.total).toBe(6);
  });

  it('plusieurs +4 simultanément → cumul 8', () => {
    const group = [pen('red', 4), pen('blue', 4)];
    const res = canPlayMultipleCards(group, baseCtx());
    expect(res.ok).toBe(true);
    expect(res.total).toBe(8);
  });

  it('plusieurs +8 simultanément → cumul 16', () => {
    const group = [pen('yellow', 8), pen('green', 8)];
    const res = isValidTurn(group, baseCtx());
    expect(res.ok).toBe(true);
    expect(res.penalty).toBe(16);
  });

  it('plusieurs +10 simultanément → cumul 20', () => {
    const group = [pen('red', 10), pen('green', 10)];
    const res = isValidTurn(group, baseCtx());
    expect(res.ok).toBe(true);
    expect(res.penalty).toBe(20);
  });

  it('combinaison de pénalités différentes +2 +4 = +6', () => {
    const group = [pen('red', 2), pen('blue', 4)];
    const res = isValidTurn(group, baseCtx());
    expect(res.ok).toBe(true);
    expect(res.penalty).toBe(6);
    expect(res.nextLastValue).toBe(4);
  });

  it('refuse un cumul qui viole la hiérarchie (+2 avec un +8 en cours de +4)', () => {
    const ctx = baseCtx({ pendingPenalty: { total: 4, lastValue: 4 } });
    const res = canPlayMultipleCards([pen('red', 2), pen('blue', 8)], ctx);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Cumul interdit/i);
  });

  it('refuse de mélanger numéro et pénalité', () => {
    const res = canPlayMultipleCards([num('blue', 5), pen('red', 2)], baseCtx());
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/interdit/i);
  });
});

describe('11-13. règles de couleur et de numéro', () => {
  it('groupe de même numéro multi-couleurs', () => {
    const group = [num('red', 5), num('yellow', 5), num('green', 5)];
    // le dessus est un BLEU 2 : aucun 5 ne colle -> refusé
    expect(canPlaySameNumberGroup(group, baseCtx()).ok).toBe(false);
    // sur un BLEU 5, le groupe est jouable et la couleur de sortie est imposée
    const ctx5 = baseCtx({ topCard: num('blue', 5) });
    expect(canPlaySameNumberGroup(group, ctx5).ok).toBe(true);
    const verdict = isValidTurn(group, ctx5);
    expect(verdict.ok).toBe(true);
    expect(verdict.colorOptions.sort()).toEqual(['green', 'red', 'yellow']);
  });

  it('refuse un groupe de numéros différents', () => {
    const res = canPlaySameNumberGroup([num('red', 5), num('yellow', 7)], baseCtx());
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/numéros différents/i);
  });

  it('refuse un groupe de 5 alors que le dessus est un 2 bleu', () => {
    const res = canPlaySameNumberGroup([num('red', 5), num('yellow', 5)], baseCtx());
    expect(res.ok).toBe(false);
  });

  it('carte de même couleur', () => {
    expect(canPlayCard(num('blue', 8), baseCtx()).ok).toBe(true);
    expect(canPlayCard(num('blue', 3), baseCtx()).ok).toBe(true);
  });

  it('carte de même numéro, couleur différente', () => {
    expect(canPlayCard(num('red', 2), baseCtx()).ok).toBe(true);
    expect(canPlayCard(num('yellow', 2), baseCtx()).ok).toBe(true);
  });

  it('carte totalmente incompatible', () => {
    const res = canPlayCard(num('green', 7), baseCtx());
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/ne correspond ni/i);
  });

  it('couleur active imposée par un joker', () => {
    const ctx = baseCtx({ topCard: wild(), activeColor: 'green' });
    expect(canPlayCard(num('green', 3), ctx).ok).toBe(true);
    expect(canPlayCard(num('red', 3), ctx).ok).toBe(false);
    expect(canPlayCard(wild(), ctx).ok).toBe(true);
  });

  it('le joker définit la couleur choisie par le joueur', () => {
    const res = isValidTurn([wild()], baseCtx(), 'yellow');
    expect(res.ok).toBe(true);
    expect(res.nextColor).toBe('yellow');
    expect(res.colorOptions.sort()).toEqual(['blue', 'green', 'red', 'yellow']);
  });

  it('refuse une couleur impossible', () => {
    const res = isValidTurn([wild()], baseCtx(), 'violet');
    expect(res.ok).toBe(false);
  });
});

describe('14. coups invalides', () => {
  it('sélection vide', () => {
    expect(isValidTurn([], baseCtx()).ok).toBe(false);
  });
  it('ne peut pas poser plus de 5 cartes en une action (garde-fou anti-pile géante)', () => {
    const six = [pen('red', 2), pen('red', 4), pen('red', 8), pen('red', 10), pen('red', 2), pen('red', 4)];
    const res = canPlayMultipleCards(six, baseCtx());
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/au maximum 5 cartes/i);
    expect(canPlayMultipleCards(six.slice(0, 5), baseCtx()).ok).toBe(true);
  });
  it('la limite est configurable', () => {
    const six = [pen('red', 2), pen('red', 4), pen('red', 8), pen('red', 10), pen('red', 2), pen('red', 4)];
    const ctx = baseCtx({ config: { maxCardsPerPlay: 8 } });
    expect(canPlayMultipleCards(six, ctx).ok).toBe(true);
  });
  it('jouer hors de son tour est traité par le serveur (règle partagée)', () => {
    // la règle partagée ne connaît pas le tour : elle valide la combinaison
    expect(isValidTurn([num('blue', 1)], baseCtx()).ok).toBe(true);
  });
  it('action + joker', () => {
    expect(canPlayMultipleCards([createCard('blue', 'action', 'skip'), wild()], baseCtx()).ok).toBe(false);
  });
});

describe('15-16. absence de réponse et pioche automatique', () => {
  it('aucune réponse possible → le joueur doit piocher le total', () => {
    const ctx = baseCtx({ pendingPenalty: { total: 14, lastValue: 8 } });
    const main = [num('blue', 3), num('red', 9), pen('green', 2)];
    expect(canRespondToPenalty(main, ctx)).toBe(false);
    const res = drawPenalty(ctx.pendingPenalty);
    expect(res.amount).toBe(14);
    expect(res.nextTotal).toBe(0);
  });

  it('réponse possible → pas de pioche forcée', () => {
    const ctx = baseCtx({ pendingPenalty: { total: 4, lastValue: 4 } });
    expect(canRespondToPenalty([num('blue', 3), pen('green', 8)], ctx)).toBe(true);
    expect(drawPenalty(ctx.pendingPenalty).amount).toBe(4);
  });

  it('la chaîne +2 +4 +8 +10 atteint 24 puis se remet à zéro', () => {
    let total = 0;
    for (const v of [2, 4, 8, 10]) total = accumulatePenalty(total, [pen('blue', v)]).total;
    expect(total).toBe(24);
    const reset = drawPenalty({ total, lastValue: 10 });
    expect(reset.nextTotal).toBe(0);
  });
});

describe('utilitaires pour l\'interface', () => {
  it('getPlayableCards filtre correctement', () => {
    const main = [num('blue', 4), num('red', 2), num('green', 9), pen('blue', 2)];
    const playable = getPlayableCards(main, baseCtx());
    const values = playable.map((c) => c.id);
    expect(main[0].id).toBe(values[0]);
    expect(main[1].id).toBe(values[1]);
    expect(main[3].id).toBe(values[2]);
    expect(main[2].id).not.toBe(values[2]);
  });

  it('findPlayableGroups détecte les groupes prêts à jouer', () => {
    const main = [num('blue', 2), num('red', 2), num('green', 9)];
    const groups = findPlayableGroups(main, baseCtx());
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0].length).toBe(2);
  });

  it('la pioche contient les 4 couleurs, les 4 pénalités et des jokers', () => {
    const deck = createDeck();
    const colors = new Set(deck.map((c) => c.color));
    expect([...colors].sort()).toEqual(['blue', 'green', 'red', 'wild', 'yellow']);
    const penalties = new Set(deck.filter((c) => c.kind === 'penalty').map((c) => c.value));
    expect([...penalties].sort((a, b) => a - b)).toEqual([2, 4, 8, 10]);
    expect(deck.length).toBeGreaterThan(100);
  });
});