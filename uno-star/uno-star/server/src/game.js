/**
 * ==========================================================
 *  GAME — toute la logique serveur autoritaire.
 *  Le client n'envoie que des intentions ; ce fichier decide.
 * ==========================================================
 */

import { PHASE, DEFAULT_CONFIG } from '@uno-star/shared/constants';
import { accumulatePenalty, createContext, isValidTurn } from '@uno-star/shared/rules';
import { createDeck, describeCard, penaltyValue, shuffle } from '@uno-star/shared/cards';
import { makeId, randomAvatar } from '@uno-star/shared/room';

const now = () => Date.now();

export class Game {
  constructor({ code, hostId = null, config = {} } = {}) {
    this.code = code;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.players = [];
    this.status = PHASE.LOBBY;
    this.hostId = hostId;
    this.deck = [];
    this.discard = [];
    this.currentPlayerId = null;
    this.direction = 1;
    this.activeColor = null;
    this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
    this.winnerId = null;
    this.ranking = [];
    this.log = [];
    this.round = 0;
    this.timers = new Set();
    this.turnTimer = null;
    this.turnStartedAt = 0;
    this.turnDeadline = 0;
    this.lastEvent = null; // { type, ... } pour animer cote client
    this.eventSeq = 0;
  }

  /* ---------------------------------------------------------------- *
   *  Gestion du temps
   * ---------------------------------------------------------------- */
  schedule(delayMs, fn) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      try {
        fn();
      } catch (err) {
        console.error('[game] timer error', err);
      }
    }, delayMs);
    if (typeof t.unref === 'function') t.unref();
    this.timers.add(t);
    return t;
  }
  clearTimer(t) {
    if (t) {
      clearTimeout(t);
      this.timers.delete(t);
    }
  }
  clearAllTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.turnTimer = null;
  }

  /* ---------------------------------------------------------------- *
   *  Joueurs
   * ---------------------------------------------------------------- */
  get player() {
    return (id) => this.players.find((p) => p.id === id) || null;
  }

  bySocket(socketId) {
    return this.players.find((p) => p.socketId === socketId) || null;
  }

  byToken(token) {
    if (!token) return null;
    return this.players.find((p) => p.token === token) || null;
  }

  get isHostable() {
    return this.status === PHASE.LOBBY && this.players.length >= 2;
  }

  addPlayer({ name, avatar, token, socketId }) {
    if (this.players.length >= this.config.maxPlayers) {
      return { error: `Salle complète (${this.config.maxPlayers} joueurs maximum).` };
    }
    if (this.status !== PHASE.LOBBY) {
      return { error: 'La partie a deja commence.' };
    }
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    let finalName = name;
    if (taken.has(String(name).toLowerCase())) {
      let i = 2;
      while (taken.has(`${name} ${i}`.toLowerCase())) i += 1;
      finalName = `${name} ${i}`;
    }
    const player = {
      id: makeId('p'),
      name: finalName,
      avatar: avatar || randomAvatar(),
      token: token || null,
      socketId: socketId || null,
      ready: false,
      connected: true,
      hand: [],
      unoState: null,
      seat: this.players.length,
      joinedAt: now(),
      rejoinUntil: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.pushLog(`${player.name} rejoint la salle.`, 'join');
    return { player };
  }

  setReady(playerId, ready) {
    const p = this.player(playerId);
    if (!p) return { error: 'Joueur introuvable.' };
    p.ready = !!ready;
    this.pushLog(`${p.name} est ${p.ready ? 'prêt' : 'en attente'}.`, 'ready');
    return { ok: true };
  }

  /** Place conservee apres une deconnexion ; suppression par l'hote apres le delai. */
  markDisconnected(playerId) {
    const p = this.player(playerId);
    if (!p || !p.connected) return { ok: false };
    p.connected = false;
    p.socketId = null;
    p.ready = false;
    p.rejoinUntil = now() + this.config.disconnectGraceMs;
    this.pushLog(`${p.name} s'est déconnecté. Place conservée ${Math.round(this.config.disconnectGraceMs / 1000)} s.`, 'disconnect');
    // si c'etait son tour : on raccourcit immediatement le delai d'attente
    if (this.status === PHASE.PLAYING && this.currentPlayerId === playerId) this.startTurnTimer();
    this.schedule(this.config.disconnectGraceMs, () => {
      const still = this.player(playerId);
      if (!still || still.connected) return; // il est revenu, on ne touche a rien
      this.removePlayer(playerId, 'absent');
    });
    if (this.hostId === playerId) this.transferHost();
    return { ok: true };
  }

  markConnected(playerId, socketId) {
    const p = this.player(playerId);
    if (!p) return { error: 'Joueur introuvable.' };
    p.connected = true;
    p.socketId = socketId;
    p.rejoinUntil = null;
    // il retrouve la main : on lui rend son temps de jeu complet s'il joue
    if (this.status === PHASE.PLAYING && this.currentPlayerId === playerId) this.startTurnTimer();
    this.pushLog(`${p.name} est de retour.`, 'rejoin');
    return { ok: true };
  }

  transferHost() {
    const alive = this.players.filter((p) => p.connected);
    const next = alive[0] || this.players[0];
    if (next) this.hostId = next.id;
  }

  removePlayer(playerId, reason = 'removed') {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return { error: 'Joueur introuvable.' };
    const p = this.players[idx];
    this.players.splice(idx, 1);
    this.players.forEach((pl, i) => {
      pl.seat = i;
    });
    this.pushLog(`${p.name} ${reason === 'absent' ? 'n\'est pas revenu' : 'a quitté la partie'}.`, 'leave');

    if (this.status === PHASE.PLAYING) {
      // son tour passe au suivant automatiquement
      if (this.currentPlayerId === playerId) {
        if (this.players.length === 0) this.endGame(null, 'abandon');
        else this.advanceTurn({ skip: false, reverse: false });
      }
      if (this.players.length < this.config.minPlayers) this.endGame(null, 'trop_peu_joueurs');
    } else if (this.players.length < this.config.minPlayers) {
      this.resetToLobby();
    }
    if (this.hostId === playerId) this.transferHost();
    return { ok: true };
  }

  /* ---------------------------------------------------------------- *
   *  Lancement
   * ---------------------------------------------------------------- */
  start() {
    if (this.status !== PHASE.LOBBY) return { error: 'La partie a deja commence.' };
    if (this.players.length < this.config.minPlayers) {
      return { error: `Il faut au moins ${this.config.minPlayers} joueurs.` };
    }
    if (!this.players.every((p) => p.ready)) {
      return { error: 'Tous les joueurs doivent être prêts.' };
    }
    this.deal();
    this.status = PHASE.PLAYING;
    this.round += 1;
    this.currentPlayerId = this.players[0].id;
    this.direction = 1;
    this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };

    // Premiere carte retournee au centre
    const first = this.discard[0];
    this.activeColor = first.color;
    if (first.kind === 'penalty') {
      // la carte de depart applique sa penalite au premier joueur
      this.pendingPenalty = { total: penaltyValue(first), lastValue: Number(first.value), sourceId: null };
      this.pushLog(`Carte de départ : +${first.value} — le premier joueur devra piocher ${this.pendingPenalty.total}.`, 'penalty');
    } else {
      this.pushLog(`Carte de départ : ${describeCard(first)}.`, 'deal');
    }
    this.pushLog(`La partie commence ! ${this.players.length} joueurs.`, 'start');
    this.startTurnTimer();
    return { ok: true };
  }

  deal() {
    this.deck = shuffle(createDeck(this.config));
    this.discard = [];
    this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
    for (const p of this.players) {
      p.hand = [];
      p.unoState = null;
    }
    // une carte face cachee au centre
    this.discard.push(this.deck.pop());
    for (let i = 0; i < this.config.handSize; i += 1) {
      for (const p of this.players) p.hand.push(this.deck.pop());
    }
  }

  resetToLobby() {
    this.clearAllTimers();
    this.status = PHASE.LOBBY;
    this.deck = [];
    this.discard = [];
    this.currentPlayerId = null;
    this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
    this.winnerId = null;
    this.ranking = [];
    for (const p of this.players) {
      p.hand = [];
      p.unoState = null;
    }
  }

  /* ---------------------------------------------------------------- *
   *  Tour
   * ---------------------------------------------------------------- */
  get topCard() {
    return this.discard[this.discard.length - 1] || null;
  }

  get currentPlayer() {
    return this.player(this.currentPlayerId);
  }

  contextFor(playerId) {
    const p = this.player(playerId);
    return createContext({
      topCard: this.topCard,
      activeColor: this.activeColor,
      pendingPenalty: this.pendingPenalty,
      config: this.config,
      hand: p ? p.hand : [],
    });
  }

  startTurnTimer() {
    this.clearTimer(this.turnTimer);
    if (this.status !== PHASE.PLAYING) return;
    const p = this.currentPlayer;
    // Un joueur deconnecte ne doit pas faire bloquer la table : delai raccourci.
    const offline = !!p && !p.connected;
    const ms = offline ? this.config.disconnectedTurnTimerMs : this.config.turnTimerMs;
    this.turnStartedAt = now();
    this.turnDeadline = now() + ms;
    this.turnTimer = this.schedule(ms, () => {
      if (this.status !== PHASE.PLAYING) return;
      const cur = this.currentPlayer;
      if (cur && cur.id === this.currentPlayerId) {
        this.pushLog(
          cur.connected
            ? `Temps écoulé : ${cur.name} pioche automatiquement.`
            : `${cur.name} est déconnecté : son tour est passé automatiquement.`,
          'timeout',
        );
        this.draw(cur.id, { auto: true });
      }
    });
  }

  advanceTurn({ skip = false, reverse = false } = {}) {
    if (reverse) this.direction = this.direction === 1 ? -1 : 1;
    if (this.players.length === 0) {
      this.endGame(null, 'abandon');
      return;
    }
    const idx = this.players.findIndex((p) => p.id === this.currentPlayerId);
    let nextIdx = (idx + this.direction + this.players.length) % this.players.length;
    if (skip) nextIdx = (nextIdx + this.direction + this.players.length) % this.players.length;
    this.currentPlayerId = this.players[nextIdx].id;
    this.startTurnTimer();
  }

  /* ---------------------------------------------------------------- *
   *  Pioche
   * ---------------------------------------------------------------- */
  refillDeck() {
    if (this.deck.length > 0) return 0;
    if (!this.config.reshuffleDiscard || this.discard.length <= 1) return 0;
    const top = this.discard.pop();
    this.deck = shuffle(this.discard);
    this.discard = [top];
    this.pushLog('La défausse est remêlée pour compléter la pioche.', 'reshuffle');
    return 1;
  }

  /**
   * Pioche n cartes pour un joueur. La pioche est un tableau dont on retire
   * la fin (deck.pop()) ; au besoin la defausse est remelee.
   */
  giveCards(playerId, n) {
    const p = this.player(playerId);
    if (!p) return 0;
    const taken = [];
    for (let i = 0; i < Math.max(0, n); i += 1) {
      if (this.deck.length === 0) this.refillDeck();
      if (this.deck.length === 0) break;
      taken.push(this.deck.pop());
    }
    p.hand.push(...taken);
    if (taken.length) this.emitEvent('draw', { playerId, count: taken.length });
    return taken.length;
  }

  /* ---------------------------------------------------------------- *
   *  Action : jouer
   * ---------------------------------------------------------------- */
  play(playerId, cardIds, chosenColor) {
    const p = this.player(playerId);
    if (!p) return { error: 'Joueur introuvable.' };
    if (this.status !== PHASE.PLAYING) return { error: "La partie n'est pas en cours." };
    if (!p.connected) return { error: 'Vous êtes déconnecté.' };
    if (this.currentPlayerId !== playerId) {
      return { error: `Ce n'est pas votre tour (c'est au tour de ${this.currentPlayer?.name ?? '—'}).` };
    }
    if (p.unoState && !p.unoState.called) p.unoState = null; // il rejoue, l'ancienne fenetre UNO tombe

    const ids = [...new Set(Array.isArray(cardIds) ? cardIds : [])];
    if (ids.length === 0) return { error: 'Sélectionnez au moins une carte.' };

    const hand = new Map(p.hand.map((c) => [c.id, c]));
    const cards = [];
    for (const id of ids) {
      const c = hand.get(id);
      if (!c) return { error: 'Une des cartes sélectionnées ne figure pas dans votre main.' };
      cards.push(c);
    }

    const ctx = this.contextFor(playerId);
    const verdict = isValidTurn(cards, ctx, chosenColor);
    if (!verdict.ok) return { error: verdict.reason, code: 'INVALID_PLAY' };

    // --- application ---
    const playedIds = new Set(cards.map((c) => c.id));
    p.hand = p.hand.filter((c) => !playedIds.has(c.id));
    this.discard.push(...cards);

    const penaltyBefore = this.pendingPenalty.total;
    const acc = accumulatePenalty(penaltyBefore, cards);
    this.pendingPenalty = {
      total: acc.total,
      lastValue: acc.lastValue,
      sourceId: penaltyBefore > 0 ? this.pendingPenalty.sourceId : playerId,
    };
    this.activeColor = verdict.nextColor ?? this.activeColor;

    const detail = cards.map((c) => describeCard(c)).join(' + ');
    this.pushLog(`${p.name} joue ${detail}.`, 'play');
    if (verdict.penalty > 0) {
      this.pushLog(
        `Pénalité cumulée : +${acc.total} cartes (${penaltyBefore} + ${verdict.penalty}).`.replace('(0 + ', '('),
        'penalty',
      );
    }
    if (verdict.wild) this.pushLog(`${p.name} fixe la couleur ${this.activeColor}.`, 'color');
    this.emitEvent('play', { cards, color: this.activeColor, penalty: acc.total, playerId });

    // --- fenetre UNO ---
    this.refreshUnoWindow(p);

    // --- victoire ? ---
    if (p.hand.length === 0) {
      this.endGame(playerId, 'dernière carte');
      return { ok: true, win: true };
    }

    if (verdict.reverse) this.direction = this.direction === 1 ? -1 : 1;
    this.advanceTurn({ skip: verdict.skipNext, reverse: false });
    return { ok: true, penalty: acc.total };
  }

  /* ---------------------------------------------------------------- *
   *  Action : piocher
   * ---------------------------------------------------------------- */
  draw(playerId, { auto = false, count = null } = {}) {
    const p = this.player(playerId);
    if (!p) return { error: 'Joueur introuvable.' };
    if (this.status !== PHASE.PLAYING) return { error: "La partie n'est pas en cours." };
    if (this.currentPlayerId !== playerId) return { error: "Ce n'est pas votre tour." };

    const penalty = this.pendingPenalty;
    if (penalty.total > 0) {
      const got = this.giveCards(playerId, penalty.total);
      this.pushLog(
        `${p.name} ne peut pas continuer le cumul : ${got} carte(s) piochée(s) (+${penalty.total}).`,
        'penalty-draw',
      );
      this.emitEvent('penalty-draw', { playerId, amount: penalty.total, got });
      this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
      this.advanceTurn({ skip: false, reverse: false });
      return { ok: true, drew: got, penalty: penalty.total, endedTurn: true };
    }

    const n = count ?? this.config.drawAfterPass;
    const got = this.giveCards(playerId, n);
    this.pushLog(`${p.name} pioche ${got} carte(s).`, 'draw');

    if (got === 0) {
      this.pushLog(`${p.name} ne peut rien piocher et passe son tour.`, 'pass');
      this.advanceTurn({ skip: false, reverse: false });
      return { ok: true, drew: 0, endedTurn: true, drawnCard: null, canPlayDrawn: false };
    }

    // La carte piochee est jouable au coup suivant : le joueur peut la poser.
    const drawnCard = p.hand[p.hand.length - 1];
    const ctx = this.contextFor(playerId);
    const playable = drawnCard ? isValidTurn([drawnCard], ctx).ok : false;
    if (auto || !playable) {
      this.advanceTurn({ skip: false, reverse: false });
      return { ok: true, drew: got, endedTurn: true, drawnCard, canPlayDrawn: false };
    }
    return { ok: true, drew: got, endedTurn: false, drawnCard, canPlayDrawn: true };
  }

  /* ---------------------------------------------------------------- *
   *  Regle UNO
   * ---------------------------------------------------------------- */
  refreshUnoWindow(p) {
    if (p.unoState) this.clearTimer(p.unoState.timer);
    p.unoState = null;
    if (p.hand.length !== 1 || !this.config.unoRequired) return;
    if (this.status !== PHASE.PLAYING) return;
    const timer = this.schedule(this.config.unoWindowMs, () => this.penalizeUno(p.id, 'Automatique'));
    p.unoState = { called: false, penalized: false, deadline: now() + this.config.unoWindowMs, timer };
  }

  callUno(playerId) {
    const p = this.player(playerId);
    if (!p) return { error: 'Joueur introuvable.' };
    if (p.hand.length !== 1) return { error: 'UNO ne se crie qu\'avec une seule carte en main.' };
    if (p.unoState?.penalized) return { error: 'Trop tard, la pénalité UNO a déjà été appliquée.' };
    if (p.unoState?.called) return { error: 'UNO déjà annoncé.' };
    if (!p.unoState) return { error: 'Aucune fenêtre UNO ouverte : vous avez déjà joué.' };
    p.unoState.called = true;
    this.clearTimer(p.unoState.timer);
    this.pushLog(`🔊 ${p.name} annonce UNO !`, 'uno');
    this.emitEvent('uno', { playerId, auto: false });
    return { ok: true };
  }

  catchUno(catcherId, targetId) {
    const catcher = this.player(catcherId);
    const target = this.player(targetId);
    if (!catcher || !target) return { error: 'Joueur introuvable.' };
    if (targetId === catcherId) return { error: 'Impossible de se dénoncer soi-même.' };
    if (!this.config.unoManualCatch) return { error: 'Le signalement UNO est désactivé.' };
    if (this.currentPlayerId !== catcherId) return { error: 'Signalez pendant votre tour.' };
    if (target.hand.length !== 1) return { error: `${target.name} a plus d'une carte.` };
    if (!target.unoState || target.unoState.called) return { error: `${target.name} a déjà crié UNO.` };
    if (target.unoState.penalized) return { error: 'La pénalité a déjà été appliquée.' };
    return this.penalizeUno(targetId, `${catcher.name} l'a signalé`);
  }

  penalizeUno(playerId, by) {
    const p = this.player(playerId);
    if (!p || !p.unoState || p.unoState.penalized || p.unoState.called) return { error: 'Pénalité UNO non applicable.' };
    p.unoState.penalized = true;
    this.clearTimer(p.unoState.timer);
    const got = this.giveCards(playerId, this.config.unoMissPenalty);
    this.pushLog(
      `${p.name} n'a pas crié UNO (${by}) : +${this.config.unoMissPenalty} cartes.`,
      'uno-penalty',
    );
    this.emitEvent('uno-penalty', { playerId, amount: this.config.unoMissPenalty });
    return { ok: true, drew: got };
  }

  /* ---------------------------------------------------------------- *
   *  Fin de partie
   * ---------------------------------------------------------------- */
  endGame(winnerId, reason = 'dernière carte') {
    this.clearAllTimers();
    this.status = PHASE.FINISHED;
    this.winnerId = winnerId;
    this.ranking = [...this.players]
      .sort((a, b) => {
        if (a.id === winnerId) return -1;
        if (b.id === winnerId) return 1;
        if (a.hand.length !== b.hand.length) return a.hand.length - b.hand.length;
        return a.name.localeCompare(b.name);
      })
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, avatar: p.avatar, cards: p.hand.length }));
    const w = this.player(winnerId);
    this.pushLog(
      w ? `🎉 ${w.name} gagne la partie ! (${reason})` : `Partie terminée : ${reason}.`,
      'win',
    );
    this.emitEvent('win', { winnerId, reason });
  }

  /** Rejouer : nouvelle distribution, meme ordre de siege. */
  replay() {
    if (this.status !== PHASE.FINISHED && this.status !== PHASE.LOBBY) return { error: 'Impossible de relancer.' };
    if (this.players.length < this.config.minPlayers) return { error: 'Pas assez de joueurs.' };
    this.clearAllTimers();
    for (const p of this.players) {
      p.ready = false;
      p.hand = [];
      p.unoState = null;
    }
    this.status = PHASE.LOBBY;
    this.winnerId = null;
    this.ranking = [];
    this.deck = [];
    this.discard = [];
    this.currentPlayerId = null;
    this.activeColor = null;
    this.pendingPenalty = { total: 0, lastValue: null, sourceId: null };
    this.pushLog('Nouvelle manche : tout le monde doit se remettre prêt.', 'reset');
    return { ok: true };
  }

  /* ---------------------------------------------------------------- *
   *  Journal + evenements
   * ---------------------------------------------------------------- */
  pushLog(text, type = 'info') {
    this.log.push({ id: ++this.eventSeq, t: Date.now(), text, type });
    if (this.log.length > 60) this.log.shift();
  }

  emitEvent(type, payload = {}) {
    this.lastEvent = { type, seq: this.eventSeq, t: Date.now(), ...payload };
  }

  /* ---------------------------------------------------------------- *
   *  Vue filtree pour UN joueur (securite : pas de cartes adverses)
   * ---------------------------------------------------------------- */
  publicPlayer(p, forPlayerId) {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      seat: p.seat,
      ready: p.ready,
      connected: p.connected,
      cardCount: p.hand.length,
      isHost: p.id === this.hostId,
      uno: p.hand.length === 1 && !!p.unoState,
      unoCalled: !!(p.unoState && p.unoState.called),
      unoPenalized: !!(p.unoState && p.unoState.penalized),
      rejoinUntil: p.rejoinUntil,
      isMe: p.id === forPlayerId,
    };
  }

  getState(playerId) {
    const me = this.player(playerId) || null;
    return {
      code: this.code,
      status: this.status,
      round: this.round,
      config: {
        minPlayers: this.config.minPlayers,
        maxPlayers: this.config.maxPlayers,
        handSize: this.config.handSize,
        unoRequired: this.config.unoRequired,
        unoWindowMs: this.config.unoWindowMs,
        unoMissPenalty: this.config.unoMissPenalty,
        turnTimerMs: this.config.turnTimerMs,
        disconnectedTurnTimerMs: this.config.disconnectedTurnTimerMs,
      },
      players: this.players.map((p) => this.publicPlayer(p, playerId)),
      me: me
        ? {
            id: me.id,
            name: me.name,
            avatar: me.avatar,
            isHost: me.id === this.hostId,
            ready: me.ready,
            connected: me.connected,
            token: me.token,
            hand: me.hand,
            unoState: me.unoState
              ? { called: me.unoState.called, penalized: me.unoState.penalized, deadline: me.unoState.deadline }
              : null,
          }
        : null,
      table: {
        topCard: this.topCard,
        deckCount: this.deck.length,
        discardCount: this.discard.length,
        activeColor: this.activeColor,
        currentPlayerId: this.currentPlayerId,
        direction: this.direction,
        pendingPenalty: this.pendingPenalty.total,
        pendingLastValue: this.pendingPenalty.lastValue,
        turnStartedAt: this.turnStartedAt,
        turnDeadline: this.turnDeadline,
      },
      winnerId: this.winnerId,
      ranking: this.ranking,
      log: this.log.slice(-24),
      lastEvent: this.lastEvent,
      serverTime: Date.now(),
    };
  }
}
