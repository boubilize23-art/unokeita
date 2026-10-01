/**
 * Tests d'integration : vrais clients Socket.IO contre un vrai serveur.
 * Verifie le cycle complet : creation de salle → partie → jeu → deconnexion.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { createCard } from '@uno-star/shared/cards';
import { canPlayCard, createContext, getPlayableCards } from '@uno-star/shared/rules';

let ctx;
let url;
const clients = [];

beforeAll(async () => {
  ctx = createApp({ logger: { log() {} } });
  await new Promise((resolve) => ctx.server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${ctx.server.address().port}`;
});

afterAll(async () => {
  for (const c of clients) c.close();
  ctx.close();
  await new Promise((resolve) => ctx.server.close(resolve));
});

function connect() {
  const c = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(c);
  return new Promise((resolve, reject) => {
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
}

const emit = (sock, event, payload = {}) =>
  new Promise((resolve) => {
    sock.timeout(6000).emit(event, payload, (err, res) => resolve(err ? { error: String(err) } : res));
  });

const waitState = (sock, predicate, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const check = (s) => {
      if (predicate(s)) {
        cleanup();
        resolve(s);
      }
    };
    const cleanup = () => {
      sock.off('room:state', check);
      clearTimeout(timer);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('timeout en attente d\'un état'));
    }, timeout);
    sock.on('room:state', check);
  });

describe('e2e — cycle de vie d\'une partie', () => {
  it('création, connexion, prêt, lancement, jeu et confidentialité', async () => {
    const host = await connect();
    const created = await emit(host, 'room:create', { name: 'Alice', avatar: 'fox' });
    expect(created.ok).toBe(true);
    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.state.players).toHaveLength(1);
    expect(created.state.me.hand).toHaveLength(0);

    const guest = await connect();
    const joined = await emit(guest, 'room:join', { code: created.code, name: 'Bob', avatar: 'cat' });
    expect(joined.ok).toBe(true);
    expect(joined.state.players).toHaveLength(2);
    expect(joined.state.players[0].isHost).toBe(true);

    // l'hôte ne peut pas demarrer tant que tout le monde n'est pas prêt
    const tooEarly = await emit(host, 'room:start', {});
    expect(tooEarly.error).toMatch(/prêts/i);

    await emit(host, 'room:ready', { ready: true });
    await emit(guest, 'room:ready', { ready: true });

    const started = waitState(host, (s) => s.status === 'playing');
    const startRes = await emit(host, 'room:start', {});
    expect(startRes.ok).toBe(true);
    const state = await started;

    expect(state.me.hand).toHaveLength(7);
    expect(state.players).toHaveLength(2);
    const otherCount = state.players.find((p) => !p.isMe).cardCount;
    expect(otherCount).toBe(7);
    // aucune carte adverse ne doit apparaître dans le payload
    const guestHand = (await emit(guest, 'room:ready', { ready: true })).state?.me?.hand;
    void guestHand;
    expect(JSON.stringify(state.players)).not.toContain('"hand"');

    // un coup légal choisi avec le moteur de règles partagé
    const ctx = createContext({
      topCard: state.table.topCard,
      activeColor: state.table.activeColor,
      pendingPenalty:
        state.table.pendingPenalty > 0
          ? { total: state.table.pendingPenalty, lastValue: state.table.pendingLastValue }
          : null,
      config: state.config,
      hand: state.me.hand,
    });
    const playable = getPlayableCards(state.me.hand, ctx)[0];
    expect(playable).toBeTruthy();
    const played = await emit(host, 'game:play', { cardIds: [playable.id] });
    expect(played.error).toBeUndefined();
    expect(played.ok).toBe(true);

    // un coup illégal est refusé
    const illegal = state.me.hand.find((c) => !canPlayCard(c, ctx).ok);
    if (illegal) {
      const wrong = await emit(host, 'game:play', { cardIds: [illegal.id] });
      expect(wrong.error).toBeTruthy();
    }
  });

  it('reconnexion : la place et les cartes sont restaurées', async () => {
    const a = await connect();
    const created = await emit(a, 'room:create', { name: 'Zoe', avatar: 'owl' });
    const b = await connect();
    await emit(b, 'room:join', { code: created.code, name: 'Max', avatar: 'panda' });
    await emit(a, 'room:ready', { ready: true });
    await emit(b, 'room:ready', { ready: true });
    const playing = waitState(a, (s) => s.status === 'playing');
    await emit(a, 'room:start', {});
    const before = await playing;
    const handBefore = before.me.hand.map((c) => c.id).sort();

    // coupure réseau de Max
    const wentOffline = waitState(a, (s) => s.players.some((p) => !p.connected));
    b.disconnect();
    const offline = await wentOffline;
    expect(offline.status).toBe('playing');

    // il revient avec son jeton
    const back = await connect();
    const resumed = await emit(back, 'room:resume', { code: created.code, token: created.token });
    expect(resumed.ok).toBe(true);
    expect(resumed.resumed).toBe(true);
    expect(resumed.state.me.hand.map((c) => c.id).sort()).toEqual(handBefore);

    const bad = await emit(back, 'room:resume', { code: created.code, token: 'faux-jeton' });
    expect(bad.error).toMatch(/session expirée/i);
  });

  it('7 joueurs : la salle démarre et les 6 adversaires sont visibles', async () => {
    const seats = [];
    const host = await connect();
    const created = await emit(host, 'room:create', { name: 'Hôte', avatar: 'crab' });
    seats.push(host);
    for (let i = 0; i < 6; i += 1) {
      const c = await connect();
      seats.push(c);
      const res = await emit(c, 'room:join', { code: created.code, name: `J${i + 1}`, avatar: 'bee' });
      expect(res.ok).toBe(true);
      await emit(c, 'room:ready', { ready: true });
    }
    await emit(host, 'room:ready', { ready: true });
    // 8e joueur refusé alors qu'on est encore dans le salon
    const extra = await connect();
    seats.push(extra);
    const refused = await emit(extra, 'room:join', { code: created.code, name: 'Trop tard', avatar: 'octo' });
    expect(refused.error).toMatch(/complète/i);

    const playing = waitState(host, (s) => s.status === 'playing' && s.players.length === 7);
    const res = await emit(host, 'room:start', {});
    expect(res.ok).toBe(true);
    const state = await playing;
    expect(state.players).toHaveLength(7);
    expect(state.me.hand).toHaveLength(7);
    expect(state.players.filter((p) => !p.isMe)).toHaveLength(6);
    expect(state.players.every((p) => p.cardCount === 7)).toBe(true);

    // une fois la partie lancée, plus personne n'entre
    const late = await connect();
    seats.push(late);
    const closed = await emit(late, 'room:join', { code: created.code, name: 'Tardif', avatar: 'octo' });
    expect(closed.error).toMatch(/commencé/i);
  });

  it('le serveur refuse un code de salle inconnu', async () => {
    const c = await connect();
    const res = await emit(c, 'room:join', { code: 'ZZZZZZ', name: 'Ghost', avatar: 'fox' });
    expect(res.error).toMatch(/introuvable/i);
  });
});

describe('e2e — pénalité UNO via socket', () => {
  it('pile +2 → +4 → pioche de 6 cartes', async () => {
    const a = await connect();
    const b = await connect();
    const c = await connect();
    const created = await emit(a, 'room:create', { name: 'P1', avatar: 'fox' });
    await emit(b, 'room:join', { code: created.code, name: 'P2', avatar: 'cat' });
    await emit(c, 'room:join', { code: created.code, name: 'P3', avatar: 'owl' });
    await emit(a, 'room:ready', { ready: true });
    await emit(b, 'room:ready', { ready: true });
    await emit(c, 'room:ready', { ready: true });
    const playing = waitState(a, (s) => s.status === 'playing');
    await emit(a, 'room:start', {});
    await playing;

    // on pilote la partie cote serveur via la classe Game (meme instance que le socket)
    const game = ctx.rooms.get(created.code);
    expect(game).toBeTruthy();
    const [A, B, C] = game.players;
    game.discard = [createCard('blue', 'number', 3)];
    game.activeColor = 'blue';
    game.pendingPenalty = { total: 0, lastValue: null, sourceId: null };

    A.hand = [createCard('red', 'penalty', 2), createCard('blue', 'number', 1)];
    B.hand = [createCard('green', 'penalty', 2), createCard('yellow', 'penalty', 4)];
    C.hand = Array.from({ length: 7 }, (_, i) => createCard('green', 'number', i + 1));

    const s1 = await emit(a, 'game:play', { cardIds: [A.hand[0].id] });
    expect(s1.ok).toBe(true);
    expect(game.pendingPenalty.total).toBe(2);

    const s2 = await emit(b, 'game:play', { cardIds: [B.hand[1].id] });
    expect(s2.ok).toBe(true);
    expect(game.pendingPenalty.total).toBe(6);

    const before = C.hand.length;
    const s3 = await emit(c, 'game:draw', {});
    expect(s3.ok).toBe(true);
    expect(C.hand.length).toBe(before + 6);
    expect(game.pendingPenalty.total).toBe(0);
  });
});