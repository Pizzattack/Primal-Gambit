/* Petit rapporteur commun à tous les contrôles.
   Une seule règle : un message doit dire OÙ regarder et QUOI faire.
   Sans ça, un contrôle qui échoue en CI coûte plus de temps qu'il n'en fait
   gagner. */

const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m';
const DIM = '\x1b[2m', BLD = '\x1b[1m', OFF = '\x1b[0m';
const color = process.env.NO_COLOR ? (_, s) => s : (c, s) => c + s + OFF;

export class Report {
  constructor(name) {
    this.name = name;
    this.errors = [];
    this.warnings = [];
  }
  error(message, { file = 'index.html', line = null, hint = null } = {}) {
    this.errors.push({ message, file, line, hint });
  }
  warn(message, { file = 'index.html', line = null, hint = null } = {}) {
    this.warnings.push({ message, file, line, hint });
  }
  get ok() { return this.errors.length === 0; }

  print() {
    const n = this.errors.length, w = this.warnings.length;
    const badge = n ? color(RED, '✗ ÉCHEC') : w ? color(YEL, '! OK') : color(GRN, '✓ OK');
    const tail = n ? `${n} erreur${n > 1 ? 's' : ''}` + (w ? `, ${w} avertissement${w > 1 ? 's' : ''}` : '')
               : w ? `${w} avertissement${w > 1 ? 's' : ''}`
               : 'rien à signaler';
    console.log(`${badge}  ${color(BLD, this.name)} ${color(DIM, '— ' + tail)}`);

    for (const it of this.errors)   line_(color(RED, '  ✗'), it);
    for (const it of this.warnings) line_(color(YEL, '  !'), it);
    if (n || w) console.log('');
  }
}

function line_(mark, it) {
  const where = it.line ? `${it.file}:${it.line}` : it.file;
  console.log(`${mark} ${color(DIM, where)}  ${it.message}`);
  if (it.hint) console.log(`     ${color(DIM, '→ ' + it.hint)}`);
}

/** Exécute une liste de contrôles et sort en code 1 si l'un d'eux échoue. */
export function runAll(reports) {
  console.log('');
  reports.forEach(r => r.print());
  const failed = reports.filter(r => !r.ok);
  const errors = reports.reduce((a, r) => a + r.errors.length, 0);
  if (failed.length) {
    console.log(color(RED, color(BLD, `${errors} erreur(s) — build refusé.`)));
    console.log(color(DIM, 'Chaque ligne ci-dessus donne le fichier et la ligne à corriger.\n'));
    process.exit(1);
  }
  console.log(color(GRN, color(BLD, 'Tous les contrôles passent.')) + '\n');
}
