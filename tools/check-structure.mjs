/* ═══════════════════════════════════════════════════════════════════════════
   CONTRÔLE 1 — Structure du document et portée globale
   ─────────────────────────────────────────────────────────────────────────
   Attrape trois bugs qui se sont réellement produits en v40 b5 :

   · <style> jamais refermé (ligne 3565) → le <script> Eruda qui suivait a été
     lu comme du CSS et n'a jamais tourné. Invisible : rien ne plante, le
     script est simplement absent.

   · fxUpdateVolume() déclarée deux fois → la seconde écrasait la première et
     référençait une variable inexistante. L'import de sauvegarde était cassé.

   · executeEndGameTrigger() déclarée deux fois → vingt lignes de code mort,
     parfaitement lisibles, qui ne tournaient jamais.

   Les quatre <script> de index.html partagent UNE portée globale : c'est
   toujours le dernier qui gagne, silencieusement.
   ═══════════════════════════════════════════════════════════════════════════ */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Report } from './lib/report.mjs';
import { extractRawTextBlocks, concatScripts, toHtmlLine, readIndex } from './lib/extract.mjs';

export function checkStructure(html = readIndex()) {
  const r = new Report('Structure du document et portée globale');
  const { blocks, errors } = extractRawTextBlocks(html);

  // ── 1. Balises à contenu brut jamais refermées ──
  for (const e of errors) {
    r.error(e.message, {
      line: e.line,
      hint: 'Refermer la balise. Tant qu\'elle est ouverte, le navigateur lit '
          + 'la suite du fichier comme du texte, pas comme du HTML.',
    });
  }

  // ── 2. Chaque bloc <script> doit être du JavaScript valide ──
  const scripts = blocks.filter(b => b.tag === 'script');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-check-'));
  scripts.forEach((b, i) => {
    const f = path.join(tmp, `block${i}.js`);
    fs.writeFileSync(f, b.code);
    try {
      execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    } catch (err) {
      const out = String(err.stderr || err.stdout || err.message);
      const m = out.match(/block\d+\.js:(\d+)/);
      r.error(`Erreur de syntaxe JavaScript : ${firstUseful(out)}`, {
        line: m ? b.startLine + Number(m[1]) - 1 : b.startLine,
      });
    }
  });

  // ── 3. Symboles globaux déclarés plusieurs fois ──
  // On travaille sur les blocs concaténés, comme le navigateur.
  const { source, map } = concatScripts(blocks);
  const seen = new Map();
  const decl = /^(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
  source.split('\n').forEach((line, i) => {
    const m = decl.exec(line);
    if (!m) return;
    const name = m[1];
    const at = toHtmlLine(map, i + 1);
    if (seen.has(name)) {
      r.error(`\`${name}\` est déclaré deux fois en portée globale `
            + `(déjà ligne ${seen.get(name)}).`, {
        line: at,
        hint: 'Les quatre <script> partagent une seule portée : la seconde '
            + 'déclaration écrase la première sans le moindre avertissement. '
            + 'Supprimer celle qui ne sert plus.',
      });
    } else {
      seen.set(name, at);
    }
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  return r;
}

function firstUseful(stderr) {
  const lines = stderr.split('\n').map(s => s.trim()).filter(Boolean);
  return lines.find(l => /Error|Unexpected|Invalid|Missing/.test(l)) || lines[0] || 'inconnue';
}
