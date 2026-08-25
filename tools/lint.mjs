#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Lance ESLint sur le JavaScript de index.html
   ─────────────────────────────────────────────────────────────────────────
       npm install     (une seule fois)
       npm run lint

   ESLint ne sait pas lire du JavaScript enfermé dans du HTML. Plutôt que
   d'ajouter un plugin, on extrait les quatre blocs <script> et on les
   CONCATÈNE : c'est exactement ce que fait le navigateur, où quatre <script>
   classiques d'une même page partagent une seule portée globale.

   Cette concaténation n'est pas un détail de commodité, c'est le cœur du
   contrôle. Analysés séparément, les deux bugs les plus coûteux de v40 b5
   étaient invisibles :
     · fxUpdateVolume() redéclarée dans un bloc plus bas, écrasant la première
     · cette même fonction lisant `_heartLoops`, déclarée dans aucun bloc

   Les numéros de ligne rapportés sont retraduits vers index.html, pour qu'on
   puisse cliquer dessus sans réfléchir.
   ═══════════════════════════════════════════════════════════════════════════ */

import { ESLint } from 'eslint';
import { extractRawTextBlocks, concatScripts, toHtmlLine, readIndex } from './lib/extract.mjs';

const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m';
const DIM = '\x1b[2m', BLD = '\x1b[1m', OFF = '\x1b[0m';
const c = process.env.NO_COLOR ? (_, s) => s : (col, s) => col + s + OFF;

const html = readIndex();
const { blocks, errors } = extractRawTextBlocks(html);

if (errors.length) {
  console.log(c(RED, '\n✗ Impossible d\'extraire le JavaScript :'));
  errors.forEach(e => console.log(`  index.html:${e.line}  ${e.message}`));
  console.log(c(DIM, '  → Corriger la structure du document d\'abord (npm run check).\n'));
  process.exit(1);
}

const { source, map } = concatScripts(blocks);
const eslint = new ESLint({ cwd: process.cwd() });
const [result] = await eslint.lintText(source, { filePath: 'index-scripts.js' });

const messages = result.messages
  .map(m => ({ ...m, htmlLine: toHtmlLine(map, m.line) }))
  .sort((a, b) => a.htmlLine - b.htmlLine);

const errs = messages.filter(m => m.severity === 2);
const warns = messages.filter(m => m.severity === 1);

console.log('');
const badge = errs.length ? c(RED, '✗ ÉCHEC') : warns.length ? c(YEL, '! OK') : c(GRN, '✓ OK');
const scripts = blocks.filter(b => b.tag === 'script').length;
console.log(`${badge}  ${c(BLD, 'ESLint')} ${c(DIM,
  `— ${scripts} blocs <script>, ${source.split('\n').length} lignes, `
  + `${errs.length} erreur(s), ${warns.length} avertissement(s)`)}`);

for (const m of messages) {
  const mark = m.severity === 2 ? c(RED, '  ✗') : c(YEL, '  !');
  console.log(`${mark} ${c(DIM, `index.html:${m.htmlLine}:${m.column}`)}  ${m.message} `
            + `${c(DIM, `(${m.ruleId || 'syntaxe'})`)}`);
}

console.log('');
if (errs.length) {
  console.log(c(RED, c(BLD, `${errs.length} erreur(s) — build refusé.`)) + '\n');
  process.exit(1);
}
console.log(c(GRN, c(BLD, 'ESLint ne trouve aucune erreur.')) + '\n');
