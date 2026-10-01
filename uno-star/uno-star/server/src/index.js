/**
 * Serveur temps reel UNO STACK (point d'entree en production).
 * L'application est construite dans app.js pour rester testable.
 */

import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const { app, server, io, rooms, close } = createApp();

server.listen(PORT, HOST, () => {
  console.log('\n  🎴  UNO STACK — serveur temps réel');
  console.log(`  ➜  http://${HOST}:${PORT}`);
  console.log(`  ➜  Socket.IO prêt · salles gérées : ${rooms.rooms.size}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n[serveur] arrêt…');
    close();
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

export { app, server, io, rooms };
