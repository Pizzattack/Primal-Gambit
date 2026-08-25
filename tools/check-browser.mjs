#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Chargement du jeu dans un vrai navigateur
   ─────────────────────────────────────────────────────────────────────────
       npm install --no-save playwright && npx playwright install chromium
       node tools/check-browser.mjs

   Les autres contrôles lisent le fichier. Celui-ci l'EXÉCUTE : c'est le seul
   moyen d'attraper ce qui ne se voit qu'au chargement — une erreur JavaScript
   au démarrage, une requête en échec, un service worker qui refuse de
   s'enregistrer.

   Ce dernier point compte particulièrement. Le contrôle va jusqu'au bout :
   après le premier chargement, il COUPE le réseau et recharge la page. Si le
   jeu atteint quand même son écran titre, la promesse du README (« an
   installed copy launches without a network connection ») est tenue. C'est la
   seule vérification qui peut le dire — et c'est elle qui a permis de valider
   sw.js, écrit dans un environnement où aucun service worker ne pouvait
   s'enregistrer.
   ═══════════════════════════════════════════════════════════════════════════ */

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8931;
const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m';
const DIM = '\x1b[2m', BLD = '\x1b[1m', OFF = '\x1b[0m';
const c = process.env.NO_COLOR ? (_, s) => s : (col, s) => col + s + OFF;

await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];

page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('response', r => {
  if (r.status() >= 400) failedRequests.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
// Laisser le préchargement de fond et l'enregistrement du service worker finir.
await page.waitForTimeout(4000);

const state = await page.evaluate(async () => {
  const regs = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistrations() : [];
  return {
    title: document.title,
    activeScreen: document.querySelector('.screen.active')?.id ?? null,
    lang: typeof _lang === 'string' ? _lang : null,
    i18nKeys: typeof STRINGS === 'object' ? Object.keys(STRINGS.en).length : 0,
    swCount: regs.length,
    swScope: regs[0]?.scope ?? null,
    cacheNames: 'caches' in window ? await caches.keys() : [],
    cardCount: typeof POOL !== 'undefined' ? POOL.length : 0,
  };
});

// ── Le vrai test du mode hors-ligne ──
// Une fois la coquille en cache, on coupe le réseau et on recharge. Si le jeu
// atteint encore son écran titre, la promesse du README (« an installed copy
// launches without a network connection ») est tenue. Sinon elle ne l'est pas,
// et mieux vaut le savoir ici que par un joueur dans le train.
let offline = { tested: false, ok: false, screen: null };
// Figer le compte d'erreurs console AVANT de couper le réseau : passer
// hors-ligne en produit forcément (les assets encore absents du cache
// d'exécution échouent, par conception). Les mélanger aux erreurs de
// chargement normal rendrait le rapport illisible.
const consoleErrorsAtLoad = consoleErrors.length;
if (state.swCount) {
  try {
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    offline.screen = await page.evaluate(
      () => document.querySelector('.screen.active')?.id ?? null);
    offline.tested = true;
    offline.ok = offline.screen === 's-title';
  } catch (e) {
    offline.tested = true;
    offline.error = e.message;
  } finally {
    await page.context().setOffline(false);
  }
}

await browser.close();
server.close();

// ── Verdict ──
const problems = [];
if (state.activeScreen !== 's-title') {
  problems.push(`L'écran actif est « ${state.activeScreen} » au lieu de « s-title ».`);
}
if (!state.cardCount) problems.push('Le pool de cartes est vide.');
if (!state.i18nKeys) problems.push('La table de traduction est vide.');
pageErrors.forEach(e => problems.push(`Erreur JavaScript au chargement : ${e}`));
failedRequests.forEach(f => problems.push(`Requête en échec : ${f}`));

console.log('');
console.log(`${problems.length ? c(RED, '✗ ÉCHEC') : c(GRN, '✓ OK')}  ${c(BLD, 'Chargement navigateur')}`);
console.log(c(DIM, `  écran « ${state.activeScreen} », ${state.cardCount} cartes, `
  + `${state.i18nKeys} clés de traduction, langue « ${state.lang} »`));
console.log(c(DIM, `  requêtes en échec : ${failedRequests.length} · `
  + `erreurs JS : ${pageErrors.length} · erreurs console : ${consoleErrorsAtLoad}`));

// Le service worker ne bloque pas la validation — le jeu reste parfaitement
// jouable sans lui, c'est le mode hors-ligne qu'on perdrait. Mais on le dit.
if (state.swCount) {
  console.log(c(GRN, `  ✓ service worker enregistré`) + c(DIM, ` (${state.swScope})`));
  console.log(c(DIM, `    caches : ${state.cacheNames.join(', ') || 'aucun encore'}`));
  if (offline.ok) {
    console.log(c(GRN, '  ✓ rechargement HORS-LIGNE : le jeu atteint l\'écran titre.'));
  } else if (offline.tested) {
    console.log(c(YEL, `  ! rechargement hors-ligne : écran « ${offline.screen}) »`
      + `${offline.error ? ' — ' + offline.error : ''}.`));
    console.log(c(DIM, '    Le README promet un lancement sans réseau : promesse non tenue.'));
  }
} else {
  console.log(c(YEL, '  ! aucun service worker enregistré — pas de mode hors-ligne.'));
}

problems.forEach(p => console.log(`${c(RED, '  ✗')} ${p}`));
consoleErrors.slice(0, consoleErrorsAtLoad).slice(0, 5)
  .forEach(e => console.log(`${c(YEL, '  !')} console : ${e.slice(0, 140)}`));

console.log('');
if (problems.length) {
  console.log(c(RED, c(BLD, `${problems.length} problème(s) — build refusé.`)) + '\n');
  process.exit(1);
}
console.log(c(GRN, c(BLD, 'Le jeu se charge proprement.')) + '\n');
