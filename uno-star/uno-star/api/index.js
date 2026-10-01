/**
 * Fonction Vercel : renvoie l'adresse du serveur temps réel.
 * Le front l'interroge au démarrage si VITE_WS_URL n'est pas défini.
 */
export default function handler(req, res) {
  const url =
    process.env.WS_URL ||
    process.env.VITE_WS_URL ||
    process.env.NEXT_PUBLIC_WS_URL ||
    'http://localhost:3001';
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'uno-stack-gateway',
    wsUrl: url,
    configured: !url.includes('localhost'),
    ts: Date.now(),
  });
}