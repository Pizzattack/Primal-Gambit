/* ═══════════════════════════════════════════════════════════════════════════
   CONTRÔLE 5 — Chaque son livré est crédité
   ─────────────────────────────────────────────────────────────────────────
   Le README promettait « the full credits list is in the repository » alors
   qu'aucun fichier de crédits n'existait, pour 64 sons empruntés. Et quand le
   fichier a été écrit, le tableur qui l'alimente s'est révélé décalé : trois
   sons attribués au mauvais auteur, un quatrième pas attribué du tout.

   Ce contrôle empêche la promesse de se déliter à nouveau. Il ne lit QUE
   CREDITS.md (pas le .xlsx) : pas de dépendance pour décompresser un zip, et
   ça tourne à chaque build. Le tableur reste la source, tools/gen-credits.py
   régénère le fichier.

   Ce qu'il ne peut pas vérifier : qu'une attribution est JUSTE. Ça s'est fait
   une fois, en comparant les formes d'onde aux aperçus publics Freesound ;
   c'est trop lourd pour une CI et ça demande le réseau.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import { Report } from './lib/report.mjs';

const SOUND_DIRS = ['assets/sounds/fx', 'assets/sounds/battle', 'assets/sounds/music'];

export function checkCredits() {
  const r = new Report('Crédits des sons');

  if (!fs.existsSync('CREDITS.md')) {
    r.error('CREDITS.md absent, alors que le README y renvoie.', {
      file: 'CREDITS.md',
      hint: 'Le générer avec : python3 tools/gen-credits.py',
    });
    return r;
  }
  const credits = fs.readFileSync('CREDITS.md', 'utf8');

  // Noms de fichiers cités dans les tableaux : | `nom.mp3` | … |
  const listed = new Set([...credits.matchAll(/\|\s*`([^`]+\.mp3)`/g)].map(m => m[1]));

  let total = 0;
  for (const dir of SOUND_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp3'))) {
      total++;
      if (!listed.has(f)) {
        r.error(`\`${dir}/${f}\` est livré avec le jeu mais absent de CREDITS.md.`, {
          file: 'CREDITS.md',
          hint: 'Ajouter une ligne dans assets/sounds/sounds.xlsx, puis relancer '
              + 'python3 tools/gen-credits.py',
        });
      }
    }
  }

  // L'inverse : une ligne qui décrit un fichier qu'on ne livre pas.
  const onDisk = new Set(
    SOUND_DIRS.filter(d => fs.existsSync(d)).flatMap(d => fs.readdirSync(d)),
  );
  for (const f of listed) {
    if (!onDisk.has(f)) {
      r.warn(`CREDITS.md cite \`${f}\`, qui n'est pas dans le dépôt.`, {
        file: 'CREDITS.md',
        hint: 'Trace d\'un renommage non reporté dans le tableur.',
      });
    }
  }

  // Sources non identifiées : à signaler sans bloquer — c'est un fait connu et
  // documenté, pas une régression.
  const unknown = (credits.match(/^- `[^`]+`$/gm) || []).length;
  if (unknown && /Unidentified sources/.test(credits)) {
    r.warn(`${unknown} son(s) livrés sans source identifiée.`, {
      file: 'CREDITS.md',
      hint: 'Voir la section « Unidentified sources ». Renseigner le tableur '
          + 'si l\'origine est retrouvée.',
    });
  }

  if (r.ok && !r.warnings.length) console.log(`  ${total} sons, tous crédités.`);
  return r;
}
