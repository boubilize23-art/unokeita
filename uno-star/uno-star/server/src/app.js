/**
 * Fabrique du serveur : express + socket.io, sans ecoute de port.
 * Utilise par index.js (production) et par les tests d'integration.
 */

import http from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';

import { RoomManager } from './rooms.js';
import { registerSocketHandlers } from './socket.js';
import { DEFAULT_CONFIG } from '@uno-star/shared/constants';
import { ROOM_CODE_ALPHABET, RULES_SUMMARY } from '@uno-star/shared';

export function createApp({ logger = console } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const origin = (process.env.CLIENT_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigin = origin.includes('*') ? true : origin;

  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '16kb' }));

  const rooms = new RoomManager({ logger });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'uno-stack-realtime', ts: Date.now(), uptime: process.uptime() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({ ok: true, defaults: DEFAULT_CONFIG, rules: RULES_SUMMARY, roomCodeAlphabet: ROOM_CODE_ALPHABET });
  });

  app.get('/api/stats', (_req, res) => res.json({ ok: true, ...rooms.stats() }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    connectionStateRecovery: { maxDisconnectionDuration: 120_000 },
  });

  const handlers = registerSocketHandlers(io, rooms, { config: {} });

  return { app, server, io, rooms, close: () => handlers.close() };
}
