/* ═══════════════════════════════════════════════════════════════════════════
   CONTRÔLE 3 — Intégrité de la table de traduction
   ─────────────────────────────────────────────────────────────────────────
   La table est le point fort du projet : 743 clés × 7 langues, sans trou. Ce
   contrôle est là pour que ça le reste quand on ajoutera des cartes — ajouter
   une clé dans "en" et oublier les six autres langues est l'erreur la plus
   facile du monde, et elle ne se voit qu'en jouant dans la bonne langue.

   Attrape aussi le bug du sous-titre roguelike (v40 b5) : le modèle
   « {n} fight{s} to win · {lives} {life} left » gardait {s} tel quel à
   l'écran, parce que le code ne remplaçait que {n}, {lives}, {life} et {s2}.
   Personne ne l'avait vu dans AUCUNE des sept langues.
   ═══════════════════════════════════════════════════════════════════════════ */

import { Report } from './lib/report.mjs';
import { readIndex } from './lib/extract.mjs';

export function checkI18n(html = readIndex()) {
  const r = new Report('Table de traduction');

  const start = html.indexOf('const STRINGS');
  if (start < 0) { r.error('Table STRINGS introuvable.'); return r; }
  const end = html.indexOf('const _laneNames', start);
  const literal = html.slice(start, end).split('=').slice(1).join('=').trim().replace(/;$/, '');

  let STRINGS;
  try {
    // La table est un littéral d'objet pur : une évaluation suffit et évite
    // d'embarquer un parseur JS pour ça.
    STRINGS = new Function(`return (${literal});`)();
  } catch (e) {
    r.error(`Table STRINGS illisible : ${e.message}`, { line: lineOf(html, start) });
    return r;
  }

  const langs = Object.keys(STRINGS);
  const ref = 'en';
  if (!STRINGS[ref]) { r.error('Langue de référence "en" absente.'); return r; }
  const refKeys = Object.keys(STRINGS[ref]);

  // ── 1. Parité des clés entre langues ──
  for (const lang of langs) {
    const keys = new Set(Object.keys(STRINGS[lang]));
    const missing = refKeys.filter(k => !keys.has(k));
    const extra = [...keys].filter(k => !refKeys.includes(k));
    if (missing.length) {
      r.error(`"${lang}" : ${missing.length} clé(s) manquante(s) par rapport à "en".`, {
        hint: `${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`,
      });
    }
    if (extra.length) {
      r.warn(`"${lang}" : ${extra.length} clé(s) qui n'existent pas en "en".`, {
        hint: `${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''}`,
      });
    }
  }

  // ── 2. Toute clé demandée par le code doit exister ──
  // Deux ensembles, à ne surtout pas confondre :
  //
  //   requested — ce que le code demande EXPLICITEMENT à t() ou via data-i18n.
  //               Toute entrée absente de la table est une erreur : le joueur
  //               verrait le nom de la clé s'afficher tel quel.
  //
  //   used      — plus large : toute chaîne en snake_case citée hors de la
  //               table. Sert UNIQUEMENT à ne pas déclarer orpheline une clé
  //               listée dans un tableau (_ALO_TIP_KEYS) ou composée
  //               dynamiquement. Ce sac contient aussi des clés localStorage
  //               et autres identifiants : on n'exige donc rien de lui.
  const outsideTable = html.slice(0, start) + html.slice(end);
  const requested = new Set();
  for (const m of outsideTable.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g)) requested.add(m[1]);
  for (const m of outsideTable.matchAll(/data-i18n(?:-ph)?="([a-zA-Z0-9_]+)"/g)) requested.add(m[1]);
  for (const k of requested) {
    if (!refKeys.includes(k)) {
      r.error(`Le code demande la clé \`${k}\`, absente de la table.`, {
        hint: 't() renverra le nom de la clé tel quel à l\'écran.',
      });
    }
  }
  const used = new Set(requested);
  for (const m of outsideTable.matchAll(/['"]([a-z][a-z0-9]*_[a-zA-Z0-9_]+)['"]/g)) used.add(m[1]);

  // ── 3. Clés traduites mais jamais affichées ──
  // Certaines sont construites dynamiquement (t('skn_' + clé)) : on ne compte
  // que celles dont AUCUN préfixe dynamique connu ne peut rendre compte.
  // Deux façons d'atteindre une clé sans jamais écrire son nom :
  //   · composition — t('skn_' + clé)
  //   · balayage    — k.startsWith('sp_'), utilisé pour retrouver une bulle de
  //     tutoriel à partir de son texte anglais (voir _spLookup dans index.html)
  const dynamicPrefixes = [
    ...[...html.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\+/g)].map(m => m[1]),
    ...[...html.matchAll(/startsWith\(\s*['"]([a-z][a-zA-Z0-9]*_)['"]\s*\)/g)].map(m => m[1]),
  ];
  const orphans = refKeys.filter(k =>
    !used.has(k) && !dynamicPrefixes.some(p => k.startsWith(p)));
  if (orphans.length) {
    // Regroupées par famille : « 30 clés log_* orphelines » se lit et se traite,
    // une liste de 195 noms ne se lit pas.
    const families = new Map();
    for (const k of orphans) {
      const fam = (k.match(/^([a-z]+_)/) || [null, 'divers'])[1];
      families.set(fam, (families.get(fam) || 0) + 1);
    }
    const top = [...families].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([f, n]) => `${f}* (${n})`).join(', ');
    r.warn(`${orphans.length} clé(s) traduites dans les ${langs.length} langues mais jamais affichées.`, {
      hint: `Familles principales : ${top}. Soit la chaîne est morte, soit `
          + 'elle existe et le code écrit encore du texte en dur à la place.',
    });
  }

  // ── 4. Placeholders : ce qui est écrit dans la table doit être remplacé ──
  // On rassemble tous les .replace('{x}', …) du fichier ; tout placeholder
  // d'une chaîne qui n'apparaît jamais dans un replace finira à l'écran.
  //
  // Uniquement sur les clés RÉELLEMENT utilisées : les placeholders d'une clé
  // orpheline n'atteignent personne. C'est le contrôle n° 3 qui signale les
  // orphelines, et le mélanger ici noierait le vrai signal.
  const replaced = new Set(
    [...html.matchAll(/\.replace\(\s*['"](\{[a-zA-Z0-9_]+\})['"]/g)].map(m => m[1]),
  );
  const unhandled = new Map();
  for (const lang of langs) {
    for (const [key, val] of Object.entries(STRINGS[lang])) {
      if (typeof val !== 'string' || !used.has(key)) continue;
      for (const m of val.matchAll(/\{[a-zA-Z0-9_]+\}/g)) {
        if (!replaced.has(m[0])) {
          const id = `${key} ${m[0]}`;
          if (!unhandled.has(id)) unhandled.set(id, lang);
        }
      }
    }
  }
  for (const [id, lang] of unhandled) {
    const [key, ph] = id.split(' ');
    r.error(`\`${key}\` contient ${ph}, que le code ne remplace jamais.`, {
      hint: `Le joueur verra « ${ph} » littéralement à l'écran (repéré en "${lang}").`,
    });
  }

  // ── 5. Cohérence du vocabulaire de jeu ──
  // L'élément Terre s'était mis à s'appeler « Nature » dans quelques bulles,
  // par contagion du nom de dossier assets/illustrations/nature/.
  const banned = [
    { re: /\bNature\b/, lang: 'en', say: 'Earth' },
    { re: /\bNature\b/, lang: 'fr', say: 'Terre' },
    { re: /\bNaturaleza\b/, lang: 'es', say: 'Tierra' },
  ];
  for (const b of banned) {
    if (!STRINGS[b.lang]) continue;
    const hits = Object.entries(STRINGS[b.lang])
      .filter(([, v]) => typeof v === 'string' && b.re.test(v)).map(([k]) => k);
    if (hits.length) {
      r.warn(`"${b.lang}" : ${hits.length} chaîne(s) nomment l'élément Terre `
           + `autrement que « ${b.say} ».`, { hint: hits.slice(0, 4).join(', ') });
    }
  }

  if (r.ok && !r.warnings.length) {
    console.log(`  ${langs.length} langues, ${refKeys.length} clés chacune.`);
  }
  return r;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
