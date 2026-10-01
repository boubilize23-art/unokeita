/**
 * Utilitaires de salle : generation de code, identifiants, avatars.
 * Partages pour que le client affiche exactement les memes libelles que le serveur.
 */

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants.js';

export function generateRoomCode(rng = Math.random, length = ROOM_CODE_LENGTH) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRoomCode(code) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

/** Jeton de reconnexion : opaque, non devinable. */
export function generateToken(rng = Math.random) {
  const bytes = [];
  for (let i = 0; i < 24; i += 1) bytes.push(Math.floor(rng() * 256).toString(16).padStart(2, '0'));
  return bytes.join('');
}

export function makeId(prefix = 'p') {
  return `${prefix}_${generateToken().slice(0, 12)}`;
}

/** 8 avatars originaux dessines en CSS/SVG (aucune resource tierce). */
export const AVATARS = [
  { id: 'fox', name: 'Renard', shape: 'fox', colors: ['#ff8a3d', '#ffd3b0'] },
  { id: 'owl', name: 'Hibou', shape: 'owl', colors: ['#7c6cf6', '#cfc6ff'] },
  { id: 'cat', name: 'Chat', shape: 'cat', colors: ['#2fb6a8', '#c7f4ef'] },
  { id: 'frog', name: 'Grenouille', shape: 'frog', colors: ['#57b846', '#d6f3cd'] },
  { id: 'bee', name: 'Abeille', shape: 'bee', colors: ['#f4c025', '#fff0c2'] },
  { id: 'panda', name: 'Panda', shape: 'panda', colors: ['#3d4453', '#e6e9f0'] },
  { id: 'crab', name: 'Crabe', shape: 'crab', colors: ['#ef5350', '#ffd2d0'] },
  { id: 'octo', name: 'Pieuvre', shape: 'octo', colors: ['#8e6cf6', '#ded1ff'] },
];

export function avatarById(id) {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function randomAvatar(rng = Math.random) {
  return AVATARS[Math.floor(rng() * AVATARS.length)].id;
}

/** Anti-spam / securite basique des pseudos. */
export function sanitizeName(raw) {
  const name = String(raw ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return name || 'Joueur';
}