/**
 * Couche Socket.IO : chaque evenement est une INTENTION.
 * Le serveur revalide systematiquement via Game (jamais de confiance client).
 */

import { AVATARS, sanitizeName, generateToken, normalizeRoomCode } from '@uno-star/shared/room';
import { PHASE } from '@uno-star/shared/constants';

const MAX_NAME_LEN = 16;

function cleanProfile(payload = {}) {
  const avatar = AVATARS.some((a) => a.id === payload.avatar) ? payload.avatar : AVATARS[0].id;
  return { name: sanitizeName(payload.name).slice(0, MAX_NAME_LEN), avatar };
}

export function registerSocketHandlers(io, rooms, options = {}) {
  const config = options.config || {};
  const sweeper = setInterval(() => rooms.sweep(), 60_000);
  if (typeof sweeper.unref === 'function') sweeper.unref();

  /** Etat personnalise : chaque joueur ne recoit que SES cartes. */
  function sendState(game) {
    for (const p of game.players) {
      if (!p.socketId) continue;
      const sock = io.sockets.sockets.get(p.socketId);
      if (sock) sock.emit('room:state', game.getState(p.id));
    }
  }

  function broadcast(game, extra = {}) {
    sendState(game);
    if (extra.event) io.to(game.code).emit('room:event', extra.event);
  }

  function fail(ack, message, code = 'ERROR') {
    const payload = { error: message, code };
    if (typeof ack === 'function') ack(payload);
    return payload;
  }

  function succeed(ack, payload) {
    if (typeof ack === 'function') ack({ ok: true, ...payload });
  }

  io.on('connection', (socket) => {
    socket.data.gameCode = null;
    socket.data.playerId = null;

    /* ---------------- Rooms ---------------- */

    socket.on('room:create', (payload = {}, ack) => {
      try {
        const profile = cleanProfile(payload);
        const game = rooms.create(payload.config || {});
        const res = game.addPlayer({ ...profile, token: generateToken(), socketId: socket.id });
        if (res.error) {
          rooms.delete(game.code);
          return fail(ack, res.error);
        }
        socket.join(game.code);
        socket.data.gameCode = game.code;
        socket.data.playerId = res.player.id;
        succeed(ack, { code: game.code, token: res.player.token, state: game.getState(res.player.id) });
      } catch (err) {
        console.error('[room:create]', err);
        return fail(ack, 'Erreur serveur.');
      }
    });

    socket.on('room:join', (payload = {}, ack) => {
      try {
        const code = normalizeRoomCode(payload.code);
        const game = rooms.get(code);
        if (!game) return fail(ack, 'Salle introuvable. Vérifiez le code.', 'NO_ROOM');
        if (game.status !== PHASE.LOBBY) return fail(ack, 'La partie a déjà commencé.', 'IN_PROGRESS');
        const profile = cleanProfile(payload);
        const res = game.addPlayer({ ...profile, token: generateToken(), socketId: socket.id });
        if (res.error) return fail(ack, res.error, 'ROOM_FULL');
        socket.join(game.code);
        socket.data.gameCode = game.code;
        socket.data.playerId = res.player.id;
        succeed(ack, { code: game.code, token: res.player.token, state: game.getState(res.player.id) });
        broadcast(game);
      } catch (err) {
        console.error('[room:join]', err);
        return fail(ack, 'Erreur serveur.');
      }
    });

    /** Reconnexion apres coupure : la place et les cartes sont conservees. */
    socket.on('room:resume', (payload = {}, ack) => {
      try {
        const code = normalizeRoomCode(payload.code);
        const game = rooms.get(code);
        if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
        const player = game.byToken(payload.token);
        if (!player) return fail(ack, 'Session expirée : rejoignez à nouveau la salle.', 'BAD_TOKEN');
        game.markConnected(player.id, socket.id);
        socket.join(game.code);
        socket.data.gameCode = game.code;
        socket.data.playerId = player.id;
        succeed(ack, { code: game.code, token: player.token, state: game.getState(player.id), resumed: true });
        broadcast(game);
      } catch (err) {
        console.error('[room:resume]', err);
        return fail(ack, 'Erreur serveur.');
      }
    });

    socket.on('room:leave', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (game && socket.data.playerId) {
        game.removePlayer(socket.data.playerId, 'quitte');
        socket.leave(game.code);
        broadcast(game);
      }
      succeed(ack, {});
      socket.data.gameCode = null;
      socket.data.playerId = null;
    });

    socket.on('room:ready', (payload = {}, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Vous n\'êtes plus dans une salle.', 'NO_ROOM');
      const res = game.setReady(socket.data.playerId, payload.ready !== false);
      if (res.error) return fail(ack, res.error);
      succeed(ack, {});
      broadcast(game);
    });

    socket.on('room:start', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      if (game.hostId !== socket.data.playerId) return fail(ack, 'Seul l\'hôte peut lancer la partie.', 'NOT_HOST');
      const res = game.start();
      if (res.error) return fail(ack, res.error);
      succeed(ack, {});
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('room:removePlayer', (payload = {}, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      if (game.hostId !== socket.data.playerId) return fail(ack, 'Seul l\'hôte peut retirer un joueur.', 'NOT_HOST');
      const target = game.player(payload.playerId);
      if (!target) return fail(ack, 'Joueur introuvable.');
      if (target.connected) return fail(ack, 'Ce joueur est encore connecté.');
      game.removePlayer(payload.playerId, 'retire');
      succeed(ack, {});
      broadcast(game);
    });

    socket.on('room:config', (payload = {}, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      if (game.hostId !== socket.data.playerId) return fail(ack, 'Seul l\'hôte change les règles.', 'NOT_HOST');
      if (game.status !== PHASE.LOBBY) return fail(ack, 'Impossible une fois la partie lancée.');
      const patch = {};
      for (const key of ['unoRequired', 'unoWindowMs', 'unoMissPenalty', 'handSize', 'turnTimerMs', 'disconnectedTurnTimerMs']) {
        if (payload[key] === undefined) continue;
        const v = Number(payload[key]);
        if (Number.isNaN(v)) continue;
        patch[key] = ['unoRequired', 'allowWild'].includes(key) ? !!v : v;
      }
      if (patch.handSize !== undefined) patch.handSize = Math.min(15, Math.max(3, Math.round(patch.handSize)));
      if (patch.unoMissPenalty !== undefined) patch.unoMissPenalty = Math.min(10, Math.max(0, Math.round(patch.unoMissPenalty)));
      if (patch.turnTimerMs !== undefined) patch.turnTimerMs = Math.min(180_000, Math.max(10_000, Math.round(patch.turnTimerMs)));
      if (patch.disconnectedTurnTimerMs !== undefined) {
        patch.disconnectedTurnTimerMs = Math.min(60_000, Math.max(2_000, Math.round(patch.disconnectedTurnTimerMs)));
      }
      Object.assign(game.config, patch);
      succeed(ack, {});
      broadcast(game);
    });

    /* ---------------- Jeu ---------------- */

    socket.on('game:play', (payload = {}, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      const res = game.play(socket.data.playerId, payload.cardIds, payload.color);
      if (res.error) return fail(ack, res.error, res.code || 'INVALID');
      succeed(ack, res);
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('game:draw', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      const res = game.draw(socket.data.playerId, { auto: false });
      if (res.error) return fail(ack, res.error);
      succeed(ack, res);
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('game:pass', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      const res = game.draw(socket.data.playerId, { auto: false });
      if (res.error) return fail(ack, res.error);
      succeed(ack, res);
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('game:uno', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      const res = game.callUno(socket.data.playerId);
      if (res.error) return fail(ack, res.error);
      succeed(ack, res);
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('game:catchUno', (payload = {}, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      const res = game.catchUno(socket.data.playerId, payload.playerId);
      if (res.error) return fail(ack, res.error);
      succeed(ack, res);
      broadcast(game, { event: game.lastEvent });
    });

    socket.on('game:replay', (_payload, ack) => {
      const game = rooms.get(socket.data.gameCode);
      if (!game) return fail(ack, 'Salle introuvable.', 'NO_ROOM');
      if (game.hostId !== socket.data.playerId) return fail(ack, 'Seul l\'hôte peut relancer.', 'NOT_HOST');
      const res = game.replay();
      if (res.error) return fail(ack, res.error);
      succeed(ack, {});
      broadcast(game);
    });

    /* ---------------- Deconnexion ---------------- */

    socket.on('disconnect', () => {
      const game = rooms.get(socket.data.gameCode);
      if (!game || !socket.data.playerId) return;
      const stillHere = game.player(socket.data.playerId);
      // si le joueur s'est reconnecte entre-temps sur une autre socket, on garde sa place
      if (stillHere && stillHere.connected && stillHere.socketId !== socket.id) return;
      game.markDisconnected(socket.data.playerId);
      sendState(game);
    });
  });

  return {
    close: () => clearInterval(sweeper),
  };
}