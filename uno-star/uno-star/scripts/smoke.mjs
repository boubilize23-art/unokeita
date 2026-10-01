/**
 * Test de fumée : joue une vraie partie complète contre un vrai serveur
 * avec de vrais clients Socket.IO, du salon jusqu'au gagnant.
 *
 *   npm run smoke                    (3 joueurs par défaut)
 *   SMOKE_PLAYERS=7 npm run smoke   (partie à 7 joueurs)
 *
 * Utile pour prouver que le jeu fonctionne de bout en bout, sans navigateur.
 */

import { spawn } from 'node:child_process';
import { io as ioClient } from 'socket.io-client';
import { createContext, findPlayableGroups, getPlayableCards, isValidTurn } from '@uno-star/shared/rules';

const PORT = Number(process.env.SMOKE_PORT || 3399);
const URL = `http://127.0.0.1:${PORT}`;
const NAMES = ['Alice', 'Bruno', 'Chloé', 'Dany', 'Emma', 'Fabien', 'Gus'];
const AVATARS = ['fox', 'cat', 'owl', 'frog', 'bee', 'panda', 'crab'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const emit = (sock, event, payload = {}) =>
  new Promise((resolve) =>
    sock.timeout(8000).emit(event, payload, (err, res) => resolve(err ? { error: String(err) } : res || {})),
  );

function connect() {
  const c = ioClient(URL, { transports: ['websocket'], forceNew: true });
  return new Promise((resolve, reject) => {
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
}

/** Construit le contexte de règles depuis l'état reçu par un joueur. */
function contextOf(state) {
  return createContext({
    topCard: state.table.topCard,
    activeColor: state.table.activeColor,
    pendingPenalty:
      state.table.pendingPenalty > 0
        ? { total: state.table.pendingPenalty, lastValue: state.table.pendingLastValue }
        : null,
    config: state.config,
    hand: state.me.hand,
  });
}

/** Choisit la meilleure action disponible et la joue (comportement humain). */
async function playTurn(sock, state, stats) {
  const ctx = contextOf(state);
  const hand = state.me.hand;
  const pending = state.table.pendingPenalty;

  // 1) pile en cours : on répond avec la plus petite pénalité acceptable
  if (pending > 0) {
    const answers = hand
      .filter((c) => c.kind === 'penalty' && isValidTurn([c], ctx).ok)
      .sort((a, b) => Number(a.value) - Number(b.value));
    if (answers.length) {
      stats.penalties += 1;
      return emit(sock, 'game:play', { cardIds: [answers[0].id] });
    }
  }

  // 2) dernière carte : on gagne
  if (hand.length === 1) {
    const solo = isValidTurn([hand[0]], ctx);
    if (solo.ok) {
      stats.plays += 1;
      return emit(sock, 'game:play', { cardIds: [hand[0].id], color: solo.colorOptions?.[0] });
    }
  }

  // 3) main très chargée : on se_allège d'un groupe de même numéro
  if (hand.length > 10) {
    const groups = findPlayableGroups(hand, ctx, 4)
      .filter((g) => g.every((c) => c.kind === 'number') && g.length >= 2)
      .sort((a, b) => b.length - a.length);
    if (groups.length) {
      const verdict = isValidTurn(groups[0], ctx);
      if (verdict.ok) {
        stats.groups += 1;
        return emit(sock, 'game:play', { cardIds: groups[0].map((c) => c.id), color: verdict.colorOptions[0] });
      }
    }
  }

  // 4) carte simple, en privilégiant les numéros (les moins « fortes »)
  const playable = getPlayableCards(hand, ctx);
  const numbers = playable.filter((c) => c.kind === 'number');
  const choice = numbers[0] || playable[0];
  if (choice) {
    const verdict = isValidTurn([choice], ctx);
    if (verdict.ok) {
      stats.plays += 1;
      return emit(sock, 'game:play', { cardIds: [choice.id], color: verdict.colorOptions?.[0] });
    }
  }

  // 5) groupe de même numéro disponible
  const groups = findPlayableGroups(hand, ctx, 3).filter((g) => g.every((c) => c.kind === 'number'));
  if (groups.length) {
    const verdict = isValidTurn(groups[0], ctx);
    if (verdict.ok) {
      stats.groups += 1;
      return emit(sock, 'game:play', { cardIds: groups[0].map((c) => c.id), color: verdict.colorOptions[0] });
    }
  }

  // 6) on prend la pile ou on pioche
  stats.draws += 1;
  return emit(sock, 'game:draw', {});
}

const server = spawn(process.execPath, ['server/src/index.js'], {
  env: { ...process.env, PORT: String(PORT), CLIENT_ORIGIN: '*' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => {
  const s = String(d).trim();
  if (s) console.log(`   [serveur] ${s}`);
});
server.stderr.on('data', (d) => process.stderr.write(`   [serveur!] ${d}`));

const seats = []; // { socket, id, state }
let failed = false;

try {
  await sleep(1300);
  const count = Math.min(7, Math.max(2, Number(process.env.SMOKE_PLAYERS || 3)));
  console.log(`\n🎴  UNO STACK — partie de démonstration à ${count} joueurs\n`);

  const host = await connect();
  const created = await emit(host, 'room:create', { name: NAMES[0], avatar: AVATARS[0] });
  if (!created.ok) throw new Error(created.error);
  seats.push({ socket: host, id: created.state.me.id, state: created.state, name: NAMES[0] });
  host.on('room:state', (s) => {
    seats[0].state = s;
  });
  console.log(`   ✓ salle créée : ${created.code}`);

  for (let i = 1; i < count; i += 1) {
    const c = await connect();
    const joined = await emit(c, 'room:join', { code: created.code, name: NAMES[i], avatar: AVATARS[i] });
    if (!joined.ok) throw new Error(joined.error);
    const seat = { socket: c, id: joined.state.me.id, state: joined.state, name: NAMES[i] };
    seats.push(seat);
    c.on('room:state', (s) => {
      seat.state = s;
    });
    await emit(c, 'room:ready', { ready: true });
  }
  await emit(host, 'room:ready', { ready: true });

  const start = await emit(host, 'room:start', {});
  if (!start.ok) throw new Error(start.error);
  await sleep(150);
  console.log(`   ✓ partie lancée (carte du dessus : ${seats[0].state.table.topCard.kind} ${seats[0].state.table.topCard.value})\n`);

  const stats = { plays: 0, groups: 0, penalties: 0, draws: 0 };
  const debug = process.env.SMOKE_DEBUG === '1';
  const deadline = Date.now() + 60_000;
  let iterations = 0;
  let lastError = '';

  while (Date.now() < deadline && iterations < 2000) {
    iterations += 1;
    const view = seats[0].state;
    if (!view) break;
    if (view.status === 'finished') break;

    const currentId = view.table.currentPlayerId;
    const seat = seats.find((s) => s.id === currentId);
    if (!seat) {
      await sleep(20);
      continue;
    }
    const before = {
      turn: iterations,
      player: seat.name,
      cards: seat.state.me.hand.length,
      pile: seat.state.table.pendingPenalty,
      top: `${seat.state.table.topCard.kind}${seat.state.table.topCard.value}`,
      deck: seat.state.table.deckCount,
    };
    const res = await playTurn(seat.socket, seat.state, stats);
    if (res.error) lastError = `${before.player}: ${res.error}`;
    if (debug) {
      console.log(
        `   #${String(before.turn).padStart(3)} ${before.player.padEnd(7)} main:${String(before.cards).padStart(2)} pile:+${before.pile} dessus:${before.top} pioche:${before.deck} → ${res.error || 'ok'}`,
      );
    }
    // laisse le temps à l'état de circuler
    let guard = 0;
    while (guard < 200) {
      await sleep(8);
      guard += 1;
      if (seats[0].state?.table.currentPlayerId !== currentId || seats[0].state?.status === 'finished') break;
    }
  }

  // laisse diffuser l'état final
  await sleep(300);
  const final = seats[0].state;
  console.log('   ── Bilan de la partie ─────────────────────────────');
  console.log(`   coups joués : ${stats.plays} · groupes : ${stats.groups} · cumuls : ${stats.penalties} · pioches : ${stats.draws}`);
  if (lastError) console.log(`   dernière action refusée → ${lastError}`);
  console.log('   ───────────────────────────────────────────────────');

  if (final?.status === 'finished' && final.ranking?.length) {
    final.ranking.forEach((r) => console.log(`   ${r.rank}. ${r.name} — ${r.cards} carte(s) restante(s)`));
    console.log(`\n   🎉 Gagnant : ${final.ranking[0].name}\n`);
  } else {
    console.log('   ⚠️  La partie ne s\'est pas terminée dans la limite de temps.\n');
    failed = true;
  }
} catch (err) {
  console.error('\n   ❌ Échec du test de fumée :', err.message, '\n');
  failed = true;
} finally {
  for (const s of seats) s.socket.close();
  server.kill('SIGTERM');
  await sleep(400);
  process.exit(failed ? 1 : 0);
}