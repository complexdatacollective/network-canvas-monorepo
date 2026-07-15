import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generated = join(pkgRoot, '.generated');
const require = createRequire(import.meta.url);

const mode = process.argv.includes('--css-only')
  ? 'css-only'
  : process.argv.includes('--dev')
    ? 'dev'
    : 'build';

function run(command, args) {
  const result = spawnSync(command, args, { cwd: pkgRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// The Tailwind @source directives scan fresco-ui's dist; fail early with a
// clear message instead of silently emitting a stylesheet with no utilities.
const frescoDist = dirname(
  require.resolve('@codaco/fresco-ui/navigation/SiteNavigation'),
);
if (!existsSync(join(frescoDist, 'SiteNavigation.js'))) {
  console.error(
    '@codaco/fresco-ui dist is missing. Build it first (turbo does this ' +
      'automatically: `pnpm build`/`pnpm test` from the repo root, or ' +
      '`pnpm --filter @codaco/fresco-ui build`).',
  );
  process.exit(1);
}

mkdirSync(generated, { recursive: true });

// 1) Compile the Tailwind entry.
run('pnpm', [
  'exec',
  'tailwindcss',
  '-i',
  'src/styles/shadow.css',
  '-o',
  join(generated, 'tailwind.css'),
]);

// 2) Split the compiled CSS for shadow-DOM use. `:root` and `@property`
// don't apply inside shadow roots as-authored: token blocks must also match
// `:host`, and `@property` registrations move to a document-level style tag.
const compiled = postcss.parse(
  readFileSync(join(generated, 'tailwind.css'), 'utf8'),
);
const documentProperties = [];
compiled.walkAtRules('property', (atRule) => {
  documentProperties.push(atRule.toString());
  atRule.remove();
});
compiled.walkRules((rule) => {
  if (rule.selector.includes(':root')) {
    rule.selectors = rule.selectors.map((selector) =>
      selector.replaceAll(':root', ':is(:root, :host)'),
    );
  }
});
writeFileSync(join(generated, 'shadow.css'), compiled.toString());
writeFileSync(
  join(generated, 'document-properties.css'),
  documentProperties.join('\n\n'),
);

// 3) Derive @font-face CSS from the canonical tailwind-config font files
// (single source of truth), keeping only normal-style faces (the nav sets
// no italic text) and rewriting fontsource URLs to a runtime placeholder.
const fontSources = [
  require.resolve('@codaco/tailwind-config/fonts/nunito.css'),
  require.resolve('@codaco/tailwind-config/fonts/inclusive-sans.css'),
];
const fontFiles = new Set();
const fontFaces = [];
for (const source of fontSources) {
  postcss
    .parse(readFileSync(source, 'utf8'))
    .walkAtRules('font-face', (face) => {
      let style = 'normal';
      let file = null;
      face.walkDecls('font-style', (decl) => {
        style = decl.value;
      });
      face.walkDecls('src', (decl) => {
        const match = decl.value.match(
          /url\('@fontsource-variable\/[^/]+\/files\/([^']+)'\)/,
        );
        if (!match) return;
        file = match[1];
        decl.value = decl.value.replace(
          /url\('[^']+'\)/,
          `url('__NC_FONT_BASE__/${match[1]}')`,
        );
      });
      if (style !== 'normal' || !file) return;
      fontFiles.add(file);
      fontFaces.push(face.toString());
    });
}
writeFileSync(join(generated, 'document-fonts.css'), fontFaces.join('\n\n'));

function copyFonts(targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const file of fontFiles) {
    const pkg = file.startsWith('nunito')
      ? '@fontsource-variable/nunito'
      : '@fontsource-variable/inclusive-sans';
    cpSync(require.resolve(`${pkg}/files/${file}`), join(targetDir, file));
  }
}

if (mode === 'css-only') process.exit(0);

if (mode === 'dev') {
  copyFonts(join(pkgRoot, 'public', 'fonts'));
  run('pnpm', ['exec', 'vite', '--open']);
} else {
  run('pnpm', ['exec', 'vite', 'build']);
  copyFonts(join(pkgRoot, 'dist', 'fonts'));
}
