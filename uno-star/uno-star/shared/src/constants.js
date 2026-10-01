/**
 * Constantes partagees entre le client et le serveur.
 * Toute valeur de regle vit ici : le client ne sert qu'a afficher,
 * le serveur reste la seule source de verite.
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const WILD = 'wild';

/** Valeurs de penalite, du plus faible au plus fort. */
export const PENALTY_VALUES = [2, 4, 8, 10];

/** Rang hierarchique : sert a valider un cumul. */
export const PENALTY_RANK = { 2: 0, 4: 1, 8: 2, 10: 3 };

/** Cartes d'action classiques. */
export const ACTION_VALUES = ['skip', 'reverse'];

/** Alphabet sans caracteres ambigus (0/O, 1/I) pour les codes de salle. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const CARD_KINDS = ['number', 'penalty', 'action', 'wild'];

export const DEFAULT_CONFIG = {
  minPlayers: 2,
  maxPlayers: 7,
  handSize: 7,

  // Regle UNO
  unoRequired: true,
  unoWindowMs: 5000, // delai pour crier UNO apres avoir pose sa 2e derniere carte
  unoMissPenalty: 2, // cartes piochees si l'annonce est ratee
  unoManualCatch: true, // un adversaire peut aussi denoncer

  // Piles de penalite
  penaltyRequiresColorMatch: false, // false = une penalite se joue sans contrainte de couleur
  penaltyMustStackEqualOrHigher: true, // reponse >= valeur posee
  maxCardsPerPlay: 5, // garde-fou : evite de d'un seul coup 20 cartes et des piles de +150

  // Cartes
  allowSkipAction: true,
  allowReverseAction: true,
  allowWild: true,
  deckCopies: 2,
  wildCopies: 4,
  numbers: { min: 1, max: 10 },

  // Divers
  turnTimerMs: 45000,
  disconnectedTurnTimerMs: 8000, // un joueur absent ne fait pas bloquer la table
  disconnectGraceMs: 60000, // duree pendant laquelle la place est reservee
  drawAfterPass: 1,
  reshuffleDiscard: true,
  winnerMode: 'cards', // classement par nombre de cartes restantes
};

export const PHASE = {
  LOBBY: 'lobby',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

/** Liste lisible des combinaisons legales (utilisee par l'UI d'aide). */
export const RULES_SUMMARY = [
  'Meme couleur, ou meme numero, pour une carte numerique.',
  'Groupe de memes numeros jouables en une seule action.',
  'Penalites +2 < +4 < +8 < +10 : on repond avec une valeur identique ou superieure.',
  'Piles de penalites melangeables : +2 puis +4 = +6, +8 +8 = +16.',
  'Cartes Joker (sans couleur) : jetables a tout moment, vous choisissez la couleur.',
];
