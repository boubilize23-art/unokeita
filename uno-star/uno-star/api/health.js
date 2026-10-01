/** Fonction Vercel : contrôlent la disponibilité du backend temps réel. */
export default async function handler(_req, res) {
  const url = process.env.WS_URL || process.env.VITE_WS_URL;
  res.setHeader('Cache-Control', 'no-store');
  if (!url) {
    return res.status(200).json({ ok: true, realtime: 'non configuré', hint: 'définissez WS_URL' });
  }
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(`${url.replace(/\/$/, '')}/api/health`, { signal: controller.signal });
    clearTimeout(t);
    const data = await r.json();
    return res.status(200).json({ ok: true, realtime: r.ok ? 'en ligne' : 'injoignable', wsUrl: url, data });
  } catch (e) {
    return res.status(200).json({ ok: true, realtime: 'injoignable', wsUrl: url, error: String(e?.message || e) });
  }
}