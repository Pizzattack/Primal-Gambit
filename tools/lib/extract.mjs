/* ═══════════════════════════════════════════════════════════════════════════
   Extraction des blocs <script> et <style> de index.html
   ─────────────────────────────────────────────────────────────────────────
   Pourquoi un extracteur maison plutôt qu'une lib ?

   Parce que le bug qu'on veut surtout attraper EST un bug d'extraction.
   En v40 b5, une balise <style> ouverte ligne 3565 n'était jamais refermée :
   le navigateur lisait donc le <script src="…eruda.js"> qui suivait comme du
   CSS, et ce script n'a jamais tourné. Un parseur HTML tolérant "réparerait"
   silencieusement ce genre d'erreur et on ne verrait rien.

   Ce module applique donc exactement la règle du tokenizer HTML pour les
   éléments à contenu textuel brut (« raw text ») : une fois <script> ou
   <style> ouvert, RIEN ne compte comme balise jusqu'à la fermeture
   correspondante. C'est ce comportement qui rend le bug visible.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';

/**
 * Découpe un document HTML en blocs de code à contenu textuel brut.
 * @returns {{blocks: Array, errors: Array}}
 *   blocks : { tag, startLine, endLine, code, attrs }
 *            startLine = ligne de la PREMIÈRE ligne de contenu (1-indexée).
 *   errors : { line, message } pour toute balise jamais refermée.
 */
export function extractRawTextBlocks(html) {
  const blocks = [];
  const errors = [];
  const openTag = /<(script|style)\b([^>]*)>/gi;
  let cursor = 0;

  for (;;) {
    openTag.lastIndex = cursor;
    const open = openTag.exec(html);
    if (!open) break;

    const tag = open[1].toLowerCase();
    const attrs = open[2].trim();
    const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
    const rest = html.slice(open.index + open[0].length);
    const close = closeRe.exec(rest);

    if (!close) {
      errors.push({
        line: lineOf(html, open.index),
        message: `<${tag}> ouvert et jamais refermé — tout ce qui suit est lu `
               + `comme du contenu de ${tag}, y compris d'éventuelles balises.`,
      });
      break;
    }

    const contentStart = open.index + open[0].length;
    const contentEnd = contentStart + close.index;

    // Un <script src="..."> n'a pas de contenu à analyser.
    if (!(tag === 'script' && /\bsrc\s*=/i.test(attrs))) {
      blocks.push({
        tag,
        attrs,
        // +1 : la ligne de contenu commence après le saut de ligne qui suit
        // la balise ouvrante (formatage réel du fichier).
        startLine: lineOf(html, contentStart) + (html[contentStart] === '\n' ? 1 : 0),
        endLine: lineOf(html, contentEnd),
        code: html.slice(contentStart, contentEnd).replace(/^\n/, ''),
      });
    }
    cursor = contentEnd + close[0].length;
  }
  return { blocks, errors };
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Concatène les blocs <script> en UN seul fichier.
 *
 * C'est volontaire : dans le navigateur, quatre <script> classiques d'une même
 * page partagent une seule portée globale. Les analyser séparément ferait rater
 * exactement les bugs qu'on cherche — une fonction redéclarée dans un bloc plus
 * bas qui écrase la précédente, ou une variable utilisée dans un bloc et jamais
 * déclarée dans aucun.
 *
 * @returns {{ source, map }} map = table pour retraduire une ligne du fichier
 *   concaténé en ligne de index.html.
 */
export function concatScripts(blocks) {
  const scripts = blocks.filter(b => b.tag === 'script');
  const parts = [];
  const map = [];
  let line = 1;

  for (const b of scripts) {
    const count = b.code.split('\n').length;
    map.push({ from: line, to: line + count - 1, htmlStart: b.startLine });
    parts.push(b.code);
    line += count;
  }
  return { source: parts.join('\n'), map };
}

/** Traduit une ligne du fichier concaténé en ligne de index.html. */
export function toHtmlLine(map, line) {
  for (const m of map) {
    if (line >= m.from && line <= m.to) return m.htmlStart + (line - m.from);
  }
  return line;
}

export function readIndex(path = 'index.html') {
  return fs.readFileSync(path, 'utf8');
}
