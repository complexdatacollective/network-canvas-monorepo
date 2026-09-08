import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  assertSpecifierDrivenChanges,
  assertVendoredLockfile,
  collectClosure,
  packagesChangedSince,
  patchDockerfileForVendor,
  previouslyVendoredPackages,
  tarballName,
  withDependents,
} from './vendor-workspace-packages.mjs';

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// A throwaway workspace: an app depending on `ui` and `runtime`, where
// `runtime` depends on `ui`, and a private tooling package the app also uses.
// Committed and tagged as a release, so `packagesChangedSince` has a ref.
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'vendor-'));
  const write = (rel, json) => {
    mkdirSync(join(root, rel), { recursive: true });
    writeFileSync(
      join(root, rel, 'package.json'),
      `${JSON.stringify(json, null, 2)}\n`,
    );
  };
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.0.0\n",
  );
  write('packages/ui', {
    name: '@x/ui',
    version: '1.0.0',
    devDependencies: { '@x/config': 'workspace:^' },
  });
  write('packages/runtime', {
    name: '@x/runtime',
    version: '2.0.0',
    dependencies: { '@x/ui': 'workspace:^', 'redux': 'catalog:' },
  });
  write('packages/exporters', { name: '@x/exporters', version: '3.0.0' });
  write('tooling/config', {
    name: '@x/config',
    version: '0.0.1',
    private: true,
  });
  write('apps/app', {
    name: 'app',
    version: '4.0.0',
    dependencies: {
      '@x/runtime': 'workspace:^',
      '@x/exporters': 'workspace:^',
    },
    devDependencies: { '@x/config': 'workspace:^' },
  });
  writeFileSync(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n");
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'ci@example.com');
  git(root, 'config', 'user.name', 'ci');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'release');
  git(root, 'tag', 'app@4.0.0');
  return root;
}

const wsPackages = {
  '@x/ui': { version: '1.0.0', private: false, dir: 'packages/ui' },
  '@x/runtime': { version: '2.0.0', private: false, dir: 'packages/runtime' },
  '@x/exporters': {
    version: '3.0.0',
    private: false,
    dir: 'packages/exporters',
  },
  '@x/config': { version: '0.0.1', private: true, dir: 'tooling/config' },
};

// The module reads the repository from the working directory, so each test
// runs inside its own throwaway workspace.
function inWorkspace(fn) {
  const root = workspace();
  const previous = process.cwd();
  process.chdir(root);
  try {
    return fn(root);
  } finally {
    process.chdir(previous);
  }
}

test('the closure follows published fields only and drops the app’s private deps', () => {
  inWorkspace(() => {
    assert.deepEqual(collectClosure(wsPackages, 'apps/app'), [
      '@x/exporters',
      '@x/runtime',
      '@x/ui',
    ]);
  });
});

test('nothing has changed right after the release', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('a committed change under a package directory marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fix');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/ui',
    ]);
  });
});

test('an uncommitted change does not count — the lane releases commits', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'packages/ui/fix.ts'),
      'export const fixed = true;\n',
    );
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('re-pinning a catalog entry a package consumes marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.1.0\n  lodash: 4.0.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump redux');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/runtime',
    ]);
  });
});

test('re-pinning a catalog entry nothing in the closure consumes marks nothing', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.1.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump lodash');
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(
      packagesChangedSince('app@4.0.0', closure, wsPackages),
      [],
    );
  });
});

test('a change to a private package a closure package is built with marks that package', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'tooling/config/base.json'),
      '{ "strict": true }\n',
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'tighten the shared tsconfig');
    const closure = collectClosure(wsPackages, 'apps/app');
    // ui is built with @x/config; runtime only depends on ui at runtime, so
    // the dependents rule, not this one, is what pulls runtime in.
    assert.deepEqual(packagesChangedSince('app@4.0.0', closure, wsPackages), [
      '@x/ui',
    ]);
  });
});

test('an unknown ref is an error, never "nothing changed"', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.throws(
      () => packagesChangedSince('app@9.9.9', closure, wsPackages),
      /git diff --quiet app@9\.9\.9/,
    );
  });
});

test('dependents of a changed package are vendored with it', () => {
  inWorkspace(() => {
    const closure = collectClosure(wsPackages, 'apps/app');
    assert.deepEqual(withDependents(['@x/ui'], closure, wsPackages), [
      '@x/runtime',
      '@x/ui',
    ]);
    // A leaf drags nothing else in.
    assert.deepEqual(withDependents(['@x/exporters'], closure, wsPackages), [
      '@x/exporters',
    ]);
  });
});

test('tarball names follow pnpm pack’s scoped form', () => {
  assert.equal(
    tarballName('@codaco/fresco-ui', '6.4.0'),
    'codaco-fresco-ui-6.4.0.tgz',
  );
});

test('the lockfile guard fails on a registry resolution of a vendored package', () => {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  const manifest = {
    vendored: { '@x/ui': 'x-ui-1.0.0.tgz' },
    registry: ['@x/exporters'],
  };
  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "importers:\n  .:\n    dependencies:\n      '@x/ui':\n        specifier: file:vendor/x-ui-1.0.0.tgz\n        version: file:vendor/x-ui-1.0.0.tgz\npackages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.match(
    assertVendoredLockfile(stage, manifest),
    /1 vendored, 1 from registry \(@x\/exporters\)/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/ui@1.0.0': {}\n  '@x/ui@file:vendor/x-ui-1.0.0.tgz': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /also resolved from the registry/,
  );

  writeFileSync(
    join(stage, 'pnpm-lock.yaml'),
    "packages:\n  '@x/exporters@3.0.0': {}\n",
  );
  assert.throws(
    () => assertVendoredLockfile(stage, manifest),
    /no file:vendor\/x-ui-1\.0\.0\.tgz resolution/,
  );
});

// The lines of apps/fresco/Dockerfile the patches anchor on, in order.
const DOCKERFILE = [
  'COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml prisma.config.ts env.js ./',
  'COPY --from=builder /app/pnpm-lock.yaml /tmp/pnpm-lock.yaml',
  '      "@codaco/protocol-validation@$(LV @codaco/protocol-validation)"; \\',
  '    npm pack --silent --pack-destination /tmp "@codaco/interview@$(LV @codaco/interview)"; \\',
].join('\n');

test('a vendored protocol-validation pins shared-consts to the lock when it is not vendored', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/protocol-validation': 'codaco-protocol-validation-13.0.1.tgz',
  });
  assert.match(
    patched,
    /"\/tmp\/vendor\/codaco-protocol-validation-13\.0\.1\.tgz" \\\n\s+"@codaco\/shared-consts@\$\(LV @codaco\/shared-consts\)"; \\/,
  );
  // The interview line is untouched: it is not vendored here.
  assert.match(
    patched,
    /npm pack --silent .*@codaco\/interview@\$\(LV @codaco\/interview\)/,
  );
});

test('vendored shared-consts installs from its tarball beside a registry protocol-validation', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/shared-consts': 'codaco-shared-consts-6.0.0.tgz',
  });
  assert.match(
    patched,
    /"@codaco\/protocol-validation@\$\(LV @codaco\/protocol-validation\)" \\\n\s+"\/tmp\/vendor\/codaco-shared-consts-6\.0\.0\.tgz"; \\/,
  );
});

test('packages outside the runner stage leave its install lines alone', () => {
  const patched = patchDockerfileForVendor(DOCKERFILE, {
    '@codaco/fresco-ui': 'codaco-fresco-ui-6.4.0.tgz',
    '@codaco/interview': 'codaco-interview-9.0.1.tgz',
  });
  assert.match(
    patched,
    /"@codaco\/protocol-validation@\$\(LV @codaco\/protocol-validation\)"; \\/,
  );
  assert.doesNotMatch(patched, /shared-consts/);
  assert.match(
    patched,
    /cp \/tmp\/vendor\/codaco-interview-9\.0\.1\.tgz \/tmp\/codaco-interview-vendored\.tgz; \\/,
  );
  assert.match(patched, /^COPY vendor \.\/vendor$/m);
  assert.match(patched, /^COPY --from=builder \/app\/vendor \/tmp\/vendor$/m);
});

test('a Dockerfile without the expected anchor fails loudly', () => {
  assert.throws(
    () =>
      patchDockerfileForVendor('FROM scratch\n', {
        '@codaco/interview': 'x.tgz',
      }),
    /deps-stage dependency COPY anchor/,
  );
});

test('a lockfile-only change since the release is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# transitive patch\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump a transitive');
    assert.throws(
      () => assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages),
      /lockfile-only dependency change cannot reach the image/,
    );
  });
});

test('a lockfile change explained by a specifier change passes', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.1.0\n  lodash: 4.0.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump redux');
    assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages);
  });
});

test('an unchanged lockfile needs no explanation', () => {
  inWorkspace(() => {
    assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages);
  });
});

// Every hotfix bumps the app's version, so a whole-file comparison of the
// manifest would call every hotfix a specifier change and never refuse.
test('a lockfile change beside only a version bump is still lockfile-only', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# transitive patch\n",
    );
    writeFileSync(
      join(root, 'apps/app/package.json'),
      `${JSON.stringify(
        {
          name: 'app',
          version: '4.0.1',
          dependencies: {
            '@x/runtime': 'workspace:^',
            '@x/exporters': 'workspace:^',
          },
          devDependencies: { '@x/config': 'workspace:^' },
        },
        null,
        2,
      )}\n`,
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump the app and a transitive');
    assert.throws(
      () => assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages),
      /lockfile-only dependency change cannot reach the image/,
    );
  });
});

test('a lockfile change beside a dependency change in a manifest passes', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'packages/exporters/package.json'),
      `${JSON.stringify(
        {
          name: '@x/exporters',
          version: '3.0.0',
          dependencies: { left: '1.0.1' },
        },
        null,
        2,
      )}\n`,
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'pin left');
    assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages);
  });
});

test('a seeded policy names the previous hotfix’s tarballs, and gives them up', () => {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  writeFileSync(
    join(stage, 'pnpm-workspace.yaml'),
    [
      'packages:',
      "  - '.'",
      'overrides:',
      '  # Packages changed since fresco@4.1.4 (and their dependents), bundled by the hotfix lane (local tarballs).',
      "  '@codaco/fresco-ui': 'file:vendor/codaco-fresco-ui-6.4.0.tgz'",
      "  '@codaco/interview': 'file:vendor/codaco-interview-9.0.1.tgz'",
      "  'effect@3.17.7': '3.17.7'",
      '',
    ].join('\n'),
  );
  assert.deepEqual(previouslyVendoredPackages(stage), [
    '@codaco/fresco-ui',
    '@codaco/interview',
  ]);
  const remaining = readFileSync(join(stage, 'pnpm-workspace.yaml'), 'utf8');
  assert.doesNotMatch(remaining, /file:vendor/);
  assert.match(remaining, /^overrides:$/m);
  assert.match(remaining, /'effect@3\.17\.7': '3\.17\.7'/);
  // Idempotent, and quiet on a policy that vendored nothing.
  assert.deepEqual(previouslyVendoredPackages(stage), []);
});

// The mirror's workspace policy is seeded from the released mirror, so a root
// override — the usual way to patch a transitive — never reaches the image.
test('a lockfile change explained only by a root override is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# forced transitive\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.0.0\noverrides:\n  left: 1.0.1\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'override left');
    assert.throws(
      () => assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages),
      /root pnpm-workspace\.yaml override or policy change does not reach the image/,
    );
  });
});

test('a lockfile change beside a re-pin nothing consumes is refused', () => {
  inWorkspace((root) => {
    writeFileSync(
      join(root, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n# re-pin\n",
    );
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\ncatalog:\n  redux: 2.0.0\n  lodash: 4.1.0\n",
    );
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'bump lodash, which nothing uses');
    assert.throws(
      () => assertSpecifierDrivenChanges('app@4.0.0', 'apps/app', wsPackages),
      /lockfile-only dependency change cannot reach the image/,
    );
  });
});
