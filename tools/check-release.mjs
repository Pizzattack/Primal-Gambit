/* ═══════════════════════════════════════════════════════════════════════════
   CONTRÔLE 4 — Cohérence de livraison
   ─────────────────────────────────────────────────────────────────────────
   L'en-tête de index.html énonce lui-même une règle : « 3 ENDROITS À METTRE À
   JOUR SIMULTANÉMENT ». Une règle écrite dans un commentaire est une règle
   qu'on oublie ; celle-ci la fait respecter par la machine.

   Vérifie aussi ce qui casse l'installation en tant qu'application :
   manifeste valide, icônes présentes, et coquille du service worker complète
   — une seule URL fautive dans SHELL_URLS et le fichier correspondant manque
   silencieusement hors-ligne.
   ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'node:fs';
import { Report } from './lib/report.mjs';
import { readIndex } from './lib/extract.mjs';

export function checkRelease(html = readIndex()) {
  const r = new Report('Cohérence de livraison');

  // ── 1. Version : en-tête vs badge affiché ──
  const hv = html.match(/VERSION\s*=\s*(\d+)/);
  const hb = html.match(/BUILD\s*=\s*(\d+)/);
  const hd = html.match(/BUILD_DATE\s*=\s*([\d.]+)/);
  const badge = html.match(/id="build-badge"[^>]*>v(\d+)\s*b(\d+)[^<]*?build\s*([\d.]+)/);

  if (!hv || !hb || !hd) {
    r.error('VERSION / BUILD / BUILD_DATE introuvables dans l\'en-tête.');
  } else if (!badge) {
    r.error('Badge de version (#build-badge) introuvable ou illisible.');
  } else {
    const [, bv, bb, bd] = badge;
    if (bv !== hv[1] || bb !== String(Number(hb[1]))) {
      r.error(`Le badge affiche v${bv} b${bb}, l'en-tête dit v${hv[1]} b${hb[1]}.`, {
        hint: 'L\'en-tête du fichier impose de mettre les deux à jour ensemble.',
      });
    }
    if (bd !== hd[1]) {
      r.error(`Le badge date du ${bd}, l'en-tête du ${hd[1]}.`);
    }
  }

  // ── 2. Manifeste ──
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  } catch (e) {
    r.error(`manifest.json illisible : ${e.message}`, { file: 'manifest.json' });
  }
  if (manifest) {
    for (const field of ['name', 'start_url', 'display', 'icons']) {
      if (!manifest[field]) {
        r.error(`Champ « ${field} » manquant — le navigateur refusera l'installation.`,
          { file: 'manifest.json' });
      }
    }
    for (const icon of manifest.icons || []) {
      if (!fs.existsSync(icon.src)) {
        r.error(`Icône \`${icon.src}\` déclarée mais absente du dépôt.`,
          { file: 'manifest.json' });
      }
    }
    const maskable = (manifest.icons || []).filter(i => /maskable/.test(i.purpose || ''));
    const anyIcon = (manifest.icons || []).filter(i => /\bany\b/.test(i.purpose || ''));
    if (maskable.length && anyIcon.length && maskable[0].src === anyIcon[0].src) {
      r.warn('La même image sert en « any » et en « maskable ».', {
        file: 'manifest.json',
        hint: 'Android ne garde que le disque central (~80 %) d\'une icône '
            + 'maskable : une image sans marge se fait rogner.',
      });
    }
  }

  // ── 3. Service worker ──
  if (!fs.existsSync('sw.js')) {
    r.warn('Pas de sw.js — le jeu installé ne se lancera pas hors-ligne.', { file: 'sw.js' });
  } else {
    const sw = fs.readFileSync('sw.js', 'utf8');
    const shell = sw.match(/const SHELL_URLS\s*=\s*\[([\s\S]*?)\]/);
    if (!shell) {
      r.warn('SHELL_URLS introuvable dans sw.js.', { file: 'sw.js' });
    } else {
      for (const m of shell[1].matchAll(/['"]\.\/([^'"]*)['"]/g)) {
        const p = m[1];
        if (p && !fs.existsSync(p)) {
          r.error(`Coquille du service worker : \`${p}\` n'existe pas.`, {
            file: 'sw.js',
            hint: 'Cette entrée sera silencieusement absente du cache hors-ligne.',
          });
        }
      }
    }
    const v = sw.match(/const VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (v && hv && hb) {
      const expect = `pg-v${hv[1]}-b${String(hb[1]).padStart(2, '0')}`;
      if (v[1] !== expect) {
        r.warn(`sw.js est en « ${v[1] }», la livraison en « ${expect} ».`, {
          file: 'sw.js',
          hint: 'Sans changement de VERSION, les anciens caches ne sont pas purgés '
              + 'et les joueurs gardent l\'ancienne version.',
        });
      }
    }
  }

  // ── 4. Aucune ressource externe ──
  // Le jeu doit rester jouable depuis un dossier local, sans réseau.
  for (const m of html.matchAll(/<(?:script|link)[^>]*(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/gi)) {
    r.error(`Ressource externe : ${m[1]}`, {
      line: lineOf(html, m.index),
      hint: 'Le jeu se veut autonome (un seul fichier + assets). Une dépendance '
          + 'réseau casse l\'ouverture en local et le mode hors-ligne.',
    });
  }
  return r;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
