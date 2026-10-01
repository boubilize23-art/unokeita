/**
 * Gestionnaire de salles : plusieurs parties simultanees, chacune isolee.
 * Code unique, duree de vie, nettoyage des salles vides.
 */

import { Game } from './game.js';
import { DEFAULT_CONFIG } from '@uno-star/shared/constants';
import { generateRoomCode, normalizeRoomCode } from '@uno-star/shared/room';

const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000; // 10 min sans joueur => salle supprimee

export class RoomManager {
  constructor({ config = {}, logger = console } = {}) {
    this.rooms = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  newCode() {
    let code = generateRoomCode();
    let guard = 0;
    while (this.rooms.has(code) && guard < 50) {
      code = generateRoomCode();
      guard += 1;
    }
    return code;
  }

  create(config = {}) {
    const code = this.newCode();
    const game = new Game({
      code,
      config: { ...this.config, ...config },
    });
    this.rooms.set(code, game);
    this.logger.log?.(`[salle] ${code} creee`);
    return game;
  }

  get(code) {
    return this.rooms.get(normalizeRoomCode(code)) || null;
  }

  has(code) {
    return this.rooms.has(normalizeRoomCode(code));
  }

  delete(code) {
    const key = normalizeRoomCode(code);
    const game = this.rooms.get(key);
    if (game) game.clearAllTimers();
    this.rooms.delete(key);
    this.logger.log?.(`[salle] ${key} supprimee`);
  }

  /** Supprime les salles vides (plus aucun joueur connecte) apres le delai. */
  sweep() {
    const now = Date.now();
    for (const [code, game] of this.rooms) {
      const hasConnected = game.players.some((p) => p.connected);
      if (!hasConnected) {
        if (!game.emptySince) game.emptySince = now;
        if (now - game.emptySince > EMPTY_ROOM_TTL_MS) this.delete(code);
      } else {
        game.emptySince = null;
      }
    }
  }

  stats() {
    return {
      rooms: this.rooms.size,
      players: [...this.rooms.values()].reduce((n, g) => n + g.players.length, 0),
      playing: [...this.rooms.values()].filter((g) => g.status === 'playing').length,
    };
  }
}

export { EMPTY_ROOM_TTL_MS };
