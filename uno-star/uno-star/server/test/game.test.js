import { describe, expect, it } from 'vitest';
import { Game } from '../src/game.js';
import { createCard } from '@uno-star/shared/cards';
import { PHASE } from '@uno-star/shared/constants';

const num = (color, value) => createCard(color, 'number', value);
const pen = (color, value) => createCard(color, 'penalty', value);
const skip = (color) => createCard(color, 'action', 'skip');

const CFG = {
  handSize: 7,
  unoWindowMs: 40,
  unoMissPenalty: 2,
  turnTimerMs: 60000,
  disconnectGraceMs: 80,
};

function build(playerCount = 2, config = {}) {
  const game = new Game({ code: 'TEST01', config: { ...CFG, ...config } });
  for (let i = 0; i < playerCount; i += 1) {
    game.addPlayer({ name: `J${i + 1}`, avatar: 'fox', token: `token-${i}` });
  }
  return game;
}

function startReady(playerCount = 2, config = {}) {
  const game = build(playerCount, config);
  game.players.forEach((p) => {
    p.ready = true;
  });
  const res = game.start();
  if (res.error) throw new Error(res.error);
  return game;
}

function setTop(game, card) {
  game.discard = [card];
  game.activeColor = card.color;
  game.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('20. partie à 7 joueurs', () => {
  it('distribue 7 cartes et enchaîne les tours dans l\'ordre', () => {
    const game = startReady(7);
    expect(game.players).toHaveLength(7);
    expect(game.status).toBe(PHASE.PLAYING);
    game.players.forEach((p) => expect(p.hand).toHaveLength(7));
    expect(game.currentPlayerId).toBe(game.players[0].id);

    setTop(game, num('blue', 5));
    for (let i = 0; i < 6; i += 1) {
      const player = game.currentPlayer;
      player.hand = [num('blue', i + 1), num('red', 4)];
      const res = game.play(player.id, [player.hand[0].id]);
      expect(res.error).toBeUndefined();
      expect(game.currentPlayerId).toBe(game.players[i + 1].id);
    }
  });

  it('refuse une 8e joueur', () => {
    const game = build(7);
    const res = game.addPlayer({ name: 'Trop', avatar: 'cat' });
    expect(res.error).toMatch(/complète/i);
  });

  it('refuse de démarrer sans tous les joueurs prêts', () => {
    const game = build(3);
    game.players[0].ready = true;
    game.players[1].ready = true;
    expect(game.start().error).toMatch(/prêts/i);
  });
});

describe('6-8. cumul de pénalités en conditions réelles', () => {
  it('+2, puis +4, puis pioche de 6', () => {
    const game = startReady(3);
    setTop(game, num('blue', 3));
    const [A, B, C] = game.players;
    A.hand = [pen('red', 2), num('blue', 1)];
    B.hand = [pen('green', 2), pen('blue', 2), pen('yellow', 4)];
    C.hand = [num('green', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];

    game.play(A.id, [A.hand[0].id]);
    expect(game.pendingPenalty.total).toBe(2);
    expect(game.pendingPenalty.lastValue).toBe(2);
    expect(game.currentPlayerId).toBe(B.id);

    // B répond avec un +2 : le cumul monte à 4
    const before = C.hand.length;
    game.play(B.id, [B.hand[1].id]);
    expect(game.pendingPenalty.total).toBe(4);

    // C ne peut pas répondre : il pioche 4 puis le tour passe
    const cBefore = C.hand.length;
    const deckBefore = game.deck.length;
    const res = game.draw(C.id, {});
    expect(res.error).toBeUndefined();
    expect(C.hand.length).toBe(cBefore + 4);
    expect(game.deck.length).toBe(deckBefore - 4);
    expect(game.pendingPenalty.total).toBe(0);
    expect(game.currentPlayerId).toBe(A.id);
    void before;
  });

  it('refuse une réponse trop faible (violation de la hiérarchie)', () => {
    const game = startReady(2);
    setTop(game, num('blue', 3));
    const [A, B] = game.players;
    A.hand = [pen('red', 8), num('blue', 1)];
    B.hand = [pen('green', 2), pen('blue', 4)];
    game.play(A.id, [A.hand[0].id]);
    const res = game.play(B.id, [B.hand[0].id]);
    expect(res.error).toMatch(/Cumul interdit/i);
    expect(game.pendingPenalty.total).toBe(8);
  });

  it('combinaison de +2 et +4 en une seule action = +6', () => {
    const game = startReady(2);
    setTop(game, num('blue', 3));
    const [A, B] = game.players;
    A.hand = [pen('red', 2), pen('green', 4), num('blue', 1)];
    const res = game.play(A.id, [A.hand[0].id, A.hand[1].id]);
    expect(res.error).toBeUndefined();
    expect(game.pendingPenalty.total).toBe(6);
    expect(game.pendingPenalty.lastValue).toBe(4);
    expect(B.hand.length).toBe(7);
  });
});

describe('15-16. absence de réponse → pioche automatique du total', () => {
  it('la pile s\'éteint puis repart : 14 cartes piochées en une fois', () => {
    const game = startReady(2, { unoRequired: false });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [pen('red', 2), pen('red', 2), pen('red', 4), pen('red', 8), num('blue', 1), num('blue', 7)];
    B.hand = [num('green', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];

    game.play(A.id, [A.hand[0].id]); // +2
    expect(game.pendingPenalty.total).toBe(2);
    expect(game.currentPlayerId).toBe(B.id);

    // B n'a aucune pénalité : il pioche 2 et le compteur repart à zéro
    const bBefore = B.hand.length;
    const draw1 = game.draw(B.id, {});
    expect(draw1.penalty).toBe(2);
    expect(B.hand.length).toBe(bBefore + 2);
    expect(game.pendingPenalty.total).toBe(0);
    expect(game.currentPlayerId).toBe(A.id);

    // A enchaîne +2 +4 +8 en une seule action : cumul 14
    const play = game.play(A.id, [A.hand[0].id, A.hand[1].id, A.hand[2].id]);
    expect(play.ok).toBe(true);
    expect(game.pendingPenalty.total).toBe(14);
    expect(game.pendingPenalty.lastValue).toBe(8);

    const bBefore2 = B.hand.length;
    const res = game.draw(B.id, {});
    expect(res.penalty).toBe(14);
    expect(B.hand.length).toBe(bBefore2 + 14);
    expect(game.pendingPenalty.total).toBe(0);
    expect(game.currentPlayerId).toBe(A.id);
  });

  it('la pioche est complétée par la défausse si elle est vide', () => {
    const game = startReady(2, { unoRequired: false });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [pen('red', 2), num('blue', 1)];
    B.hand = [num('green', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];
    game.play(A.id, [A.hand[0].id]);
    game.deck = [];
    game.discard = [num('blue', 1), num('red', 7), num('yellow', 3)];
    const before = B.hand.length;
    game.draw(B.id, {});
    expect(B.hand.length).toBe(before + 2);
    expect(game.deck.length).toBe(0);
  });
});

describe('14 / 17. règle UNO', () => {
  it('l\'annonce UNO est possible à une carte et bloque les doublons', () => {
    const game = startReady(2, { unoRequired: true, unoMissPenalty: 2, unoWindowMs: 5000 });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [num('blue', 3), num('blue', 7), num('blue', 9)];
    B.hand = [num('blue', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];

    game.play(A.id, [A.hand[0].id]);
    expect(A.hand).toHaveLength(2);
    expect(game.callUno(A.id).error).toMatch(/une seule carte/i);

    game.play(B.id, [B.hand[0].id]); // B joue un bleu, A rejoue et retombe à 1 carte
    expect(game.currentPlayerId).toBe(A.id);
    A.hand = [num('blue', 7), num('blue', 9)];
    game.play(A.id, [A.hand[0].id]);
    expect(A.hand).toHaveLength(1);
    expect(A.unoState).toBeTruthy();
    expect(A.unoState.called).toBe(false);
    expect(game.callUno(A.id).ok).toBe(true);
    expect(A.unoState.called).toBe(true);
    expect(game.callUno(A.id).error).toMatch(/déjà/i);
  });

  it('pénalité automatique quand UNO n\'est pas crié', async () => {
    const game = startReady(2, { unoRequired: true, unoMissPenalty: 3, unoWindowMs: 30 });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [num('blue', 3), num('blue', 7), num('blue', 9)];
    B.hand = [num('blue', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];
    game.play(A.id, [A.hand[0].id]);
    game.play(B.id, [B.hand[0].id]);
    A.hand = [num('blue', 7), num('blue', 9)];
    game.play(A.id, [A.hand[0].id]);
    expect(A.hand).toHaveLength(1);
    await sleep(90);
    expect(A.hand.length).toBe(4); // 1 + 3 cartes de pénalité
    expect(game.log.some((l) => l.type === 'uno-penalty')).toBe(true);
  });

  it('un adversaire peut signaler l\'absence de UNO', () => {
    const game = startReady(2, { unoRequired: true, unoMissPenalty: 2, unoWindowMs: 5000 });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [num('blue', 3), num('blue', 7), num('blue', 9)];
    B.hand = [num('blue', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];
    game.play(A.id, [A.hand[0].id]);
    game.play(B.id, [B.hand[0].id]);
    A.hand = [num('blue', 7), num('blue', 9)];
    game.play(A.id, [A.hand[0].id]);
    expect(A.hand).toHaveLength(1);
    const res = game.catchUno(B.id, A.id);
    expect(res.ok).toBe(true);
    expect(A.hand.length).toBe(3);
    expect(game.catchUno(B.id, A.id).error).toBeTruthy();
  });
});

describe('15 / 18. fin de partie', () => {
  it('poser sa dernière carte gagne la partie etétablit le classement', () => {
    const game = startReady(3);
    setTop(game, num('blue', 1));
    const [A, B, C] = game.players;
    A.hand = [num('blue', 3)];
    B.hand = [num('green', 1), num('green', 2)];
    C.hand = [num('yellow', 1), num('yellow', 2), num('yellow', 3), num('yellow', 4)];

    const res = game.play(A.id, [A.hand[0].id]);
    expect(res.win).toBe(true);
    expect(game.status).toBe(PHASE.FINISHED);
    expect(game.winnerId).toBe(A.id);
    expect(game.ranking[0].name).toBe('J1');
    expect(game.ranking.map((r) => r.cards)).toEqual([0, 2, 4]);
    expect(game.play(B.id, [B.hand[0].id]).error).toMatch(/pas en cours/i);
  });

  it('rejouer renvoie la salle dans l\'état lobby', () => {
    const game = startReady(2);
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [num('blue', 3), num('blue', 4)];
    B.hand = [num('blue', 5), num('green', 6), num('green', 7), num('green', 8), num('green', 9), num('green', 1), num('green', 2)];
    game.play(A.id, [A.hand[0].id]);
    A.hand = [num('blue', 4)];
    game.play(B.id, [B.hand[0].id]);
    expect(game.currentPlayerId).toBe(A.id);
    game.play(A.id, [A.hand[0].id]);
    expect(game.status).toBe(PHASE.FINISHED);
    const res = game.replay();
    expect(res.ok).toBe(true);
    expect(game.status).toBe(PHASE.LOBBY);
    expect(game.players.every((p) => !p.ready)).toBe(true);
    expect(game.players.every((p) => p.hand.length === 0)).toBe(true);
    // il faut se remettre prêt
    expect(game.start().error).toMatch(/prêts/i);
    game.players.forEach((p) => {
      p.ready = true;
    });
    game.start();
    expect(game.status).toBe(PHASE.PLAYING);
  });
});

describe('18. déconnexion / reconnexion', () => {
  it('la place et les cartes sont conservées', () => {
    const game = startReady(3);
    const [A, B, C] = game.players;
    A.hand = [num('blue', 3), num('red', 2)];
    const handBefore = [...A.hand];
    game.markDisconnected(A.id);
    expect(A.connected).toBe(false);
    expect(A.hand).toHaveLength(2);
    expect(game.status).toBe(PHASE.PLAYING); // la partie ne redémarre pas
    // le joueur revient
    game.markConnected(A.id, 'socket-2');
    expect(A.connected).toBe(true);
    expect(A.hand.map((c) => c.id)).toEqual(handBefore.map((c) => c.id));
    expect(C.connected).toBe(true);
    void B;
  });

  it('la place est libérée après le délai si le joueur ne revient pas', async () => {
    const game = startReady(2, { disconnectGraceMs: 40 });
    game.markDisconnected(game.players[1].id);
    expect(game.players).toHaveLength(2);
    await sleep(100);
    expect(game.players).toHaveLength(1);
  });

  it('le tour ne bloque pas la table quand le joueur est déconnecté', async () => {
    const game = startReady(2, { unoRequired: false, turnTimerMs: 60_000, disconnectedTurnTimerMs: 60 });
    const [A, B] = game.players;
    expect(game.currentPlayerId).toBe(A.id);
    const before = A.hand.length;
    const deadlineLong = game.turnDeadline - Date.now();

    game.markDisconnected(A.id);
    const deadlineShort = game.turnDeadline - Date.now();
    expect(deadlineShort).toBeLessThan(deadlineLong); // délai raccourci immédiatement
    expect(deadlineShort).toBeLessThanOrEqual(120);

    await sleep(140);
    expect(A.hand.length).toBe(before + 1); // pioche automatique
    expect(game.currentPlayerId).toBe(B.id);
    expect(game.log.some((l) => l.type === 'timeout')).toBe(true);

    // s'il revient pendant son tour, il récupère son temps complet
    game.markDisconnected(B.id);
    game.markConnected(B.id, 'sock');
    expect(game.turnDeadline - Date.now()).toBeGreaterThan(10_000);
  });

  it('le joueur qui n\'a plus son tour est.draw() ignoré', () => {
    const game = startReady(2);
    const [A, B] = game.players;
    expect(game.draw(B.id, {}).error).toMatch(/tour/i);
    expect(A.hand).toHaveLength(7);
  });
});

describe('19. sécurité : aucune fuite de cartes adverses', () => {
  it('getState ne renvoie que sa propre main', () => {
    const game = startReady(3);
    const [A] = game.players;
    const view = game.getState(A.id);
    expect(view.me.hand).toHaveLength(7);
    view.players.forEach((p) => {
      if (p.id !== A.id) {
        expect(p.hand).toBeUndefined();
        expect(p.cardCount).toBe(7);
      }
    });
    expect(JSON.stringify(view)).not.toContain(game.players[1].hand[0].id);
    expect(view.table.deckCount).toBe(game.deck.length);
  });

  it('un joueur ne peut pas jouer une carte qu\'il n\'a pas', () => {
    const game = startReady(2);
    const [A] = game.players;
    const foreign = game.players[1].hand[0].id;
    const res = game.play(A.id, [foreign]);
    expect(res.error).toMatch(/ne figure pas/i);
  });

  it('le tour est vérifié côté serveur', () => {
    const game = startReady(2);
    const [, B] = game.players;
    B.hand = [num('blue', 3)];
    const res = game.play(B.id, [B.hand[0].id]);
    expect(res.error).toMatch(/n'est pas votre tour/i);
  });
});

describe('actions et Pioche voluntary', () => {
  it('piocher puis jouer la carte piochée', () => {
    const game = startReady(2, { unoRequired: false });
    setTop(game, num('blue', 1));
    const [A, B] = game.players;
    A.hand = [num('green', 5), num('green', 6)];
    B.hand = [num('green', 1), num('green', 2), num('green', 3), num('green', 4), num('green', 5), num('green', 6), num('green', 7)];
    game.deck = [num('blue', 3)]; // pioche controllée
    const res = game.draw(A.id, {});
    expect(res.drew).toBe(1);
    expect(res.canPlayDrawn).toBe(true);
    const drawn = A.hand[A.hand.length - 1];
    expect(drawn.color).toBe('blue');
    const play = game.play(A.id, [drawn.id]);
    expect(play.error).toBeUndefined();
    expect(game.discard[game.discard.length - 1].id).toBe(drawn.id);
  });

  it('une carte d\'action passe le tour du suivant', () => {
    const game = startReady(3, { unoRequired: false });
    setTop(game, num('blue', 1));
    const [A, B, C] = game.players;
    A.hand = [skip('blue'), num('green', 9), num('green', 8)];
    game.play(A.id, [A.hand[0].id]);
    expect(game.currentPlayerId).toBe(C.id);
    void B;
  });
});