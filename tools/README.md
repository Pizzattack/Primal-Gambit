# Contrôles automatiques

Ces outils lisent le projet et signalent des problèmes. **Ils ne modifient
jamais un fichier et ne reformatent rien.**

## Pourquoi ce parti pris

`index.html` fait 26 000 lignes, écrites à la main sur des mois. Son
indentation, ses commentaires encadrés, sa mise en page : c'est ce qui rend le
fichier navigable pour son auteur. Un formateur automatique (Prettier ou
équivalent) produirait un diff de 26 000 lignes, effacerait l'historique utile
de `git blame`, et ne corrigerait pas un seul bug. Il n'y en a donc pas, et la
configuration ESLint ne contient **aucune règle de style**.

Ce qui est traqué, ce sont les pannes silencieuses — celles qui ne font pas
planter le jeu et que personne ne remarque. Chaque contrôle vient d'un bug qui
s'est réellement produit dans ce projet :

| Contrôle | Le bug qui l'a motivé |
|---|---|
| balise à contenu brut jamais refermée | un `<style>` non refermé ligne 3565 faisait lire un `<script>` comme du CSS — il n'a jamais tourné |
| symbole global déclaré deux fois | `fxUpdateVolume()` redéclarée plus bas ; l'import de sauvegarde était cassé |
| variable jamais déclarée (`no-undef`) | cette même fonction lisait `_heartLoops`, qui n'existait nulle part |
| référence d'asset inexistante | les 49 vignettes du compendium pointaient vers des fichiers absents, masquées par un `onerror` |
| parité des traductions | 7 langues à tenir alignées à chaque nouvelle carte |
| placeholder jamais remplacé | `{s}` s'affichait littéralement dans le sous-titre roguelike, dans les 7 langues |
| ressource externe | un `<script src="https://cdn…">` casse l'ouverture en local et le hors-ligne |
| cohérence de version | l'en-tête du fichier impose déjà « 3 endroits à mettre à jour ensemble » |
| son livré sans crédit | le README promettait une liste de crédits qui n'existait pas, et le tableur qui l'alimente était décalé de trois lignes |

## Utilisation

```bash
node tools/check.mjs      # aucune installation nécessaire
```

Structure, assets, traductions, cohérence de livraison. Que du Node standard :
utilisable immédiatement, sans rien télécharger.

```bash
npm install               # une seule fois
npm run lint              # ESLint sur le JavaScript de index.html
```

ESLint ne sait pas lire du JavaScript enfermé dans du HTML. `tools/lint.mjs`
extrait les quatre blocs `<script>` et les **concatène** avant l'analyse,
parce que c'est ce que fait le navigateur : quatre `<script>` classiques d'une
même page partagent une seule portée globale. Analysés séparément, les deux
bugs les plus coûteux de la v40 b5 étaient invisibles. Les numéros de ligne
rapportés sont retraduits vers `index.html`.

```bash
npm test                  # les deux d'un coup
```

```bash
npm install --no-save playwright && npx playwright install chromium
node tools/check-browser.mjs
```

Charge réellement le jeu dans Chromium : erreurs JavaScript au démarrage,
requêtes en échec, enregistrement du service worker — puis **coupe le réseau
et recharge**, pour vérifier que le jeu atteint quand même son écran titre.
C'est la seule preuve que la promesse de fonctionnement hors-ligne est tenue.

## En intégration continue

`.github/workflows/ci.yml` lance tout cela à chaque push et chaque pull
request. Le workflow ne pousse jamais de commit : il lit, il signale, il
refuse de valider.

## Crédits des sons

`assets/sounds/sounds.xlsx` est la source de vérité : une ligne par fichier,
avec son lien d'origine. `CREDITS.md` en est **généré** et ne se modifie pas à
la main.

```bash
python3 tools/gen-credits.py
```

Le contrôle `check-credits` (dans `npm run check`) vérifie ensuite que chaque
son livré figure bien dans `CREDITS.md`, et signale l'inverse — une ligne qui
décrit un fichier absent, trace habituelle d'un renommage non reporté.

Ce qu'il ne peut PAS vérifier : qu'une attribution est *juste*. Ça s'est fait
une fois, en téléchargeant les aperçus publics Freesound et en les corrélant
aux fichiers du dépôt — trois sons étaient attribués au mauvais auteur. C'est
trop lourd pour une CI, et ça demande le réseau ; à refaire à la main si un
doute revient.

## Ajouter un contrôle

Un fichier par sujet dans `tools/`, exportant une fonction qui renvoie un
`Report` (voir `lib/report.mjs`), puis un appel dans `tools/check.mjs`.

Une règle : **un message doit dire où regarder et quoi faire.** Un contrôle
qui échoue en disant seulement « erreur » coûte plus de temps qu'il n'en fait
gagner. Utiliser `line` pour que le chemin soit cliquable, et `hint` pour
expliquer pourquoi ça compte.
