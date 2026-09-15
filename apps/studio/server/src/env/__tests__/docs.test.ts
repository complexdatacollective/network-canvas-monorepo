import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ENV_DEVELOPMENT_PATH,
  ENV_EXAMPLE_PATH,
  README_PATH,
  renderEnvDevelopment,
  renderEnvExample,
  renderReadmeSection,
  spliceReadme,
} from '../../../scripts/env-docs.ts';
import { CATALOGUE, GROUPS } from '../catalogue.ts';

// A failure here means the catalogue moved without the artifacts being
// regenerated: `pnpm --filter @codaco/studio-server generate:env-docs`.

describe('generated environment documentation', () => {
  it('matches the committed .env.development', () => {
    expect(readFileSync(ENV_DEVELOPMENT_PATH, 'utf8')).toBe(
      renderEnvDevelopment(),
    );
  });

  it('matches the committed .env.example', () => {
    expect(readFileSync(ENV_EXAMPLE_PATH, 'utf8')).toBe(renderEnvExample());
  });

  it('matches the generated section of the README', () => {
    const readme = readFileSync(README_PATH, 'utf8');
    expect(readme).toBe(spliceReadme(readme, renderReadmeSection()));
  });
});

describe('the catalogue itself', () => {
  it('assigns every variable to a known group', () => {
    const groups = new Set<string>(GROUPS);
    const stray = Object.entries(CATALOGUE)
      .filter(([, doc]) => !groups.has(doc.group))
      .map(([name]) => name);
    expect(stray).toEqual([]);
  });

  it('builds the deployer template from examples alone, never from development values', () => {
    // .env.example is what a self-hoster copies to .env, so it must be built
    // only from the obviously-fake `example` placeholders. Asserting the
    // structural property catches a renderer that starts falling back to
    // `devDefault`, which is how a deployment would end up running on the
    // publicly-known development signing secret.
    const values = new Map(
      renderEnvExample()
        .split('\n')
        .filter((line) => /^#[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(1, separator), line.slice(separator + 1)];
        }),
    );

    for (const [name, doc] of Object.entries(CATALOGUE)) {
      if (!values.has(name)) continue;
      expect({ name, value: values.get(name) }).toEqual({
        name,
        value: doc.example ?? '',
      });
    }
  });

  it('offers no rate-limit knob', () => {
    // The limits are constants in src/rate-limit/scopes.ts (#1909, the ruling
    // of 2026-09-15). A `RATE_LIMIT_*` variable reappearing here would put the
    // eleven settings back into .env.example, the README table and the
    // self-host guide, where the whole point is that a deployment cannot raise
    // a security default without changing code. `REDIS_URL` — where the
    // counters live — is the one thing in this group that is configuration.
    expect(
      Object.keys(CATALOGUE).filter((name) => name.startsWith('RATE_LIMIT_')),
    ).toEqual([]);
    expect(
      Object.entries(CATALOGUE)
        .filter(([, doc]) => doc.group === 'Rate limiting')
        .map(([name]) => name),
    ).toEqual(['REDIS_URL']);
  });

  it('omits the development marker from the deployer template', () => {
    // Setting it in a deployment is refused at boot; suggesting it would be
    // an invitation to do exactly that.
    expect(renderEnvExample()).not.toContain('STUDIO_DEV_DEFAULTS');
  });
});
