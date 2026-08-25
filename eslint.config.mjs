/* ═══════════════════════════════════════════════════════════════════════════
   ESLint — configuration
   ─────────────────────────────────────────────────────────────────────────
   PRINCIPE DIRECTEUR : ce linter cherche des BUGS, jamais du style.

   index.html est écrit à la main depuis des mois. Son indentation, ses
   accolades, ses commentaires encadrés : c'est le formatage de son auteur, et
   c'est ce qui lui permet de s'y retrouver dans 26 000 lignes. Aucune règle
   ici ne réclame de le changer, et il n'y a volontairement PAS de Prettier :
   un reformatage automatique produirait un diff de 26 000 lignes qui rendrait
   tout historique illisible, pour zéro bug corrigé.

   Ce qu'on veut attraper, ce sont les pannes silencieuses. La plus coûteuse
   de v40 b5 : fxUpdateVolume() référençait `_heartLoops`, une variable qui
   n'existait nulle part. ReferenceError à chaque appel, import de sauvegarde
   cassé pendant des mois. La règle `no-undef` la signale en une seconde.

   Comment le code est analysé : tools/lint.mjs extrait les quatre blocs
   <script> et les CONCATÈNE avant de lancer ESLint, parce que c'est ce que
   fait le navigateur — quatre <script> classiques partagent une seule portée
   globale. Les analyser séparément ferait rater exactement ces bugs-là.
   ═══════════════════════════════════════════════════════════════════════════ */

import globals from 'globals';

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // Déclarés dans le HTML, pas dans le JS.
        eruda: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // ── Le cœur du sujet ──────────────────────────────────────────────
      // Une variable jamais déclarée : c'est le bug _heartLoops.
      'no-undef': 'error',
      // Une fonction déclarée deux fois : c'est le bug fxUpdateVolume, et
      // celui d'executeEndGameTrigger (20 lignes de code mort crédible).
      'no-redeclare': ['error', { builtinGlobals: true }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-cond-assign': ['error', 'always'],
      'no-sparse-arrays': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-fallthrough': 'error',
      'no-case-declarations': 'error',
      'no-async-promise-executor': 'error',
      'require-atomic-updates': 'off', // trop de faux positifs sur du code d'animation

      // ── Avertissements : utile à savoir, pas de quoi bloquer une livraison ──
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'warn',
      'no-useless-escape': 'warn',

      // ── Volontairement désactivées ───────────────────────────────────
      // Les ~95 gestionnaires inline (onclick="goTitle()") appellent des
      // fonctions globales qu'ESLint ne voit jamais utilisées : on ne
      // surveille donc que les variables des portées locales.
      'no-unused-vars': ['warn', {
        vars: 'local',
        args: 'none',
        caughtErrors: 'none',
      }],
      // Tout est en portée globale par conception : un seul fichier, pas de
      // modules. Rien à redire.
      'no-implicit-globals': 'off',
    },
  },
];
