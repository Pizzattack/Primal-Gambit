/* ═══════════════════════════════════════════════════════════════════════════
   CONTRÔLE 2 — Toutes les références d'assets pointent sur un fichier réel
   ─────────────────────────────────────────────────────────────────────────
   Attrape le bug des 49 vignettes du compendium (v40 b5) : elles pointaient
   toutes vers assets/icons/<Nom_De_Carte>.png, alors que ce dossier ne
   contient que des icônes de SKILLS. Résultat : 49 requêtes 404 à chaque
   chargement, et un compendium entièrement dépourvu d'illustrations.

   Personne ne l'a vu pendant des mois, parce qu'un onerror masquait
   proprement chaque image manquante. C'est exactement le genre de panne
   qu'une machine repère en une seconde et un humain jamais.

   Couvre : src=, data-src=, href= (local), url(...) en CSS, et les chemins
   d'assets écrits en dur dans le JavaScript.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import { Report } from './lib/report.mjs';
import { readIndex } from './lib/extract.mjs';

const IGNORE = /^(https?:|data:|blob:|mailto:|tel:|#|\/\/)/i;
// Un vrai chemin d'asset se termine par une extension de fichier. Ce filtre
// écarte les faux positifs venant du JavaScript, où `img.src = 'assets/…foo'`
// est souvent un préfixe complété par concaténation, et où `el.src = url`
// capturerait simplement le nom d'une variable.
const HAS_EXTENSION = /\.[a-z0-9]{2,4}$/i;

export function checkAssets(html = readIndex()) {
  const r = new Report('Références d\'assets');
  const refs = new Map(); // chemin -> première ligne où il apparaît

  const add = (p, index) => {
    if (!p || IGNORE.test(p)) return;
    const clean = p.split(/[?#]/)[0].trim();
    if (!clean || clean.includes('${') || clean.includes('{')) return; // construit dynamiquement
    if (!HAS_EXTENSION.test(clean)) return;
    if (!refs.has(clean)) refs.set(clean, lineOf(html, index));
  };

  const patterns = [
    /\b(?:src|data-src|href)\s*=\s*"([^"]+)"/gi,
    /\b(?:src|data-src|href)\s*=\s*'([^']+)'/gi,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    /['"`](assets\/[^'"`\n]+\.[a-z0-9]{2,4})['"`]/gi,
  ];
  for (const re of patterns) {
    for (const m of html.matchAll(re)) add(m[1], m.index);
  }

  for (const [p, line] of [...refs].sort()) {
    if (!fs.existsSync(p)) {
      r.error(`\`${p}\` n'existe pas dans le dépôt.`, {
        line,
        hint: 'Le jeu masque les images manquantes via onerror : cette panne '
            + 'est invisible à l\'œil, seul ce contrôle la voit.',
      });
    }
  }

  // ── Assets présents mais jamais référencés ──
  // Simple avertissement : ils alourdissent le ZIP (~150 Mo) sans rien apporter.
  const onDisk = walk('assets').filter(f => !/\.(md|xlsx|txt)$/i.test(f));
  const referenced = new Set([...refs.keys()]);
  const dynamicDirs = new Set(
    [...refs.keys(), ...html.matchAll(/assets\/[\w/-]+\//g)].map(x =>
      typeof x === 'string' ? x.replace(/\/[^/]*$/, '') : x[0].replace(/\/$/, '')),
  );
  const orphans = onDisk.filter(f =>
    !referenced.has(f) && !dynamicDirs.has(f.replace(/\/[^/]*$/, '')));
  if (orphans.length) {
    r.warn(`${orphans.length} fichier(s) dans assets/ ne sont référencés nulle part.`, {
      file: 'assets/',
      hint: `Exemples : ${orphans.slice(0, 3).join(', ')}. `
          + 'Ils partent quand même dans le ZIP de téléchargement.',
    });
  }
  return r;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.name.startsWith('.')) continue;
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
