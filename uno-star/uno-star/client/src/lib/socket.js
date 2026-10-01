/**
 * Connexion temps reel.
 * - en dev  : le serveur Socket.IO tourne sur localhost:3001
 * - en prod : VITE_WS_URL (Vercel heberge le front, Render/Railway le WS)
 */

import { io } from 'socket.io-client';

export function resolveServerUrl() {
  const env = import.meta.env.VITE_WS_URL;
  if (env && env.trim()) return env.trim();
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:3001`;
  return null; // prod sans configuration : on affiche une erreur claire
}

export function connect() {
  const url = resolveServerUrl();
  if (!url) return null;
  return io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 4000,
    timeout: 12_000,
  });
}

const SESSION_KEY = 'uno-stack:session';

export function saveSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* mode prive : on ignore */
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.code && parsed?.token) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
