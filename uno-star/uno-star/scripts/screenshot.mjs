/**
 * Capture d'écran de l'interface avec un vrai navigateur (Playwright).
 * Lance le serveur + le build de production, joue quelques coups, capture.
 *
 *   npm run shots
 */

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '/usr/local/lib/node_modules/playwright/index.mjs';

const WS_PORT = 3101;
const WEB_PORT = 4173;
const OUT = 'docs/captures';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const procs = [];
function run(cmd, args, env = {}, cwd = process.cwd()) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', (d) => process.stderr.write(String(d)));
  procs.push(p);
  return p;
}

try {
  await mkdir(OUT, { recursive: true });
  run(process.execPath, ['server/src/index.js'], { PORT: String(WS_PORT), CLIENT_ORIGIN: '*' });
  run('npx', ['vite', 'preview', '--port', String(WEB_PORT), '--host', '127.0.0.1'], {
    VITE_WS_URL: `http://127.0.0.1:${WS_PORT}`,
  }, 'client');
  await sleep(3500);

  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    executablePath: process.env.CHROME_PATH || undefined,
  });
  const url = `http://127.0.0.1:${WEB_PORT}`;

  const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p1 = await ctx1.newPage();
  const p2 = await ctx2.newPage();

  // --- accueil (bureau) ---
  await p1.goto(url, { waitUntil: 'networkidle' });
  await p1.waitForSelector('.home__card');
  await p1.screenshot({ path: `${OUT}/01-accueil-bureau.png` });
  console.log('  ✓ 01 accueil');

  // --- création de salle ---
  await p1.fill('.field__input', 'Alice');
  await p1.click('button:has-text("Créer une partie")');
  await p1.waitForTimeout(600);
  // (le bouton est remplacé au clic : si la salle est déjà créée, on ne reclique pas)
  if ((await p1.locator('.lobby').count()) === 0) {
    await p1.click('button:has-text("Créer la salle")');
  }
  await p1.waitForSelector('.lobby', { timeout: 10000 });
  const code = await p1.textContent('.roomcode__value');
  console.log(`  ✓ 02 salon (code ${code})`);
  await p1.screenshot({ path: `${OUT}/02-salon-hote.png` });

  // --- 2e joueur sur mobile ---
  await p2.goto(url, { waitUntil: 'networkidle' });
  await p2.fill('.field__input', 'Bruno');
  await p2.click('button:has-text("Rejoindre avec un code")');
  await p2.waitForTimeout(400);
  await p2.fill('.field__input--code', code);
  await p2.waitForTimeout(200);
  if ((await p2.locator('.lobby').count()) === 0) {
    await p2.click('button:has-text("Rejoindre la salle")');
  }
  await p2.waitForSelector('.lobby', { timeout: 10000 });
  await p2.click('button:has-text("Je suis prêt")');
  await p1.waitForTimeout(400);
  await p1.click('button:has-text("Je suis prêt")');
  await p1.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/03-salon-mobile.png` });
  console.log('  ✓ 03 salon mobile');

  // --- lancement ---
  await p1.click('button:has-text("Démarrer la partie")');
  await p1.waitForSelector('.game', { timeout: 10000 });
  await p2.waitForSelector('.game', { timeout: 10000 });
  await p1.waitForTimeout(1200);
  await p1.screenshot({ path: `${OUT}/04-table-bureau.png` });
  await p2.screenshot({ path: `${OUT}/05-table-mobile.png` });
  console.log('  ✓ 04/05 table de jeu');

  // --- quelques coups joués par l'un puis l'autre ---
  const clickPlayable = async (page) => {
    const card = page.locator('.card.is-playable').first();
    if (await card.count()) {
      await card.click();
      await page.waitForTimeout(200);
      const btn = page.locator('button:has-text("Jouer")');
      if (await btn.count() && await btn.isEnabled()) await btn.click();
      await page.waitForTimeout(600);
      return true;
    }
    const draw = page.locator('button:has-text("Piocher"), button:has-text("Prendre")').first();
    if (await draw.count()) {
      await draw.click();
      await page.waitForTimeout(600);
    }
    return false;
  };

  for (let i = 0; i < 6; i += 1) {
    const page = i % 2 === 0 ? p1 : p2;
    const s = await page.locator('.game').getAttribute('class');
    if (s?.includes('fx-win')) break;
    await clickPlayable(page);
  }
  await p1.waitForTimeout(500);
  await p1.screenshot({ path: `${OUT}/06-en-cours.png` });
  await p2.screenshot({ path: `${OUT}/07-mobile-en-cours.png` });
  console.log('  ✓ 06/07 en cours de partie');

  await browser.close();
  console.log(`\n  Captures disponibles dans ${OUT}/\n`);
} catch (err) {
  console.error('  ✗ échec des captures :', err.message);
  process.exitCode = 1;
} finally {
  for (const p of procs) p.kill('SIGTERM');
  await sleep(300);
  process.exit(process.exitCode || 0);
}