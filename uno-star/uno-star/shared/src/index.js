/**
 * Point d'entrée unique du moteur partagé.
 * Le serveur ET le client importent exactement les mêmes règles.
 */

import * as constants from './constants.js';
import * as cards from './cards.js';
import * as rules from './rules.js';
import * as room from './room.js';

export { constants, cards, rules, room };

export * from './constants.js';
export * from './cards.js';
export * from './rules.js';
export * from './room.js';