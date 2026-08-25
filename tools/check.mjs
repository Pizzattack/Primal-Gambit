#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   PRIMAL GAMBIT — contrôles de qualité
   ─────────────────────────────────────────────────────────────────────────
       node tools/check.mjs

   Aucune installation nécessaire : que du Node standard. Les contrôles sont
   taillés sur les pannes qui se sont RÉELLEMENT produites dans ce projet,
   pas sur une liste générique de bonnes pratiques.

   Ils ne touchent jamais au fichier et ne reformatent rien : index.html est
   écrit à la main depuis des mois, son formatage est celui de son auteur.

   Le linter JavaScript (ESLint), qui demande lui un `npm install`, vit à part
   dans tools/lint.mjs et tourne en CI.
   ═══════════════════════════════════════════════════════════════════════════ */

import { runAll } from './lib/report.mjs';
import { readIndex } from './lib/extract.mjs';
import { checkStructure } from './check-structure.mjs';
import { checkAssets } from './check-assets.mjs';
import { checkI18n } from './check-i18n.mjs';
import { checkRelease } from './check-release.mjs';

const html = readIndex();
runAll([
  checkStructure(html),
  checkAssets(html),
  checkI18n(html),
  checkRelease(html),
]);
