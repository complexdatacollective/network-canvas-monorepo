import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Schema } from 'effect';
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
import { DEV_ENVIRONMENT } from '../development.ts';
import { describeEnvironment, EnvironmentSchema, GROUPS } from '../schema.ts';

/** The two modules the production bundle imports for the environment boundary. */
const SCHEMA_MODULE = fileURLToPath(new URL('../schema.ts', import.meta.url));
const BOUNDARY_MODULE = fileURLToPath(new URL('../../env.ts', import.meta.url));

// A failure here means the schema moved without the artifacts being
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

describe('the schema’s own documentation', () => {
  it('assigns every variable to a known group', () => {
    const groups = new Set<string>(GROUPS);
    const stray = describeEnvironment()
      .filter((doc) => !groups.has(doc.group))
      .map((doc) => doc.name);
    expect(stray).toEqual([]);
  });

  it('documents every variable the schema declares', () => {
    // `describeEnvironment` throws on a variable with no group, summary or
    // deployment annotation, which is what replaces the exhaustive
    // `Record<VariableName, VariableDoc>` the deleted catalogue was typed as.
    // Asserting it here means a half-annotated variable fails a test rather
    // than only the generator, which nothing runs on a branch that forgot to.
    expect(() => describeEnvironment()).not.toThrow();
    expect(describeEnvironment().length).toBeGreaterThan(0);
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

    for (const doc of describeEnvironment()) {
      if (!values.has(doc.name)) continue;
      expect({ name: doc.name, value: values.get(doc.name) }).toEqual({
        name: doc.name,
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
    const declared = describeEnvironment();
    expect(
      declared
        .map((doc) => doc.name)
        .filter((name) => name.startsWith('RATE_LIMIT_')),
    ).toEqual([]);
    expect(
      declared
        .filter((doc) => doc.group === 'Rate limiting')
        .map((doc) => doc.name),
    ).toEqual(['REDIS_URL']);
  });

  it('writes a development file the schema itself accepts', () => {
    // `DEV_ENVIRONMENT` is prose to the generator: nothing validates it on the
    // way into `.env.development`, so a development value the schema would
    // refuse would first surface as a boot failure in `pnpm dev`. Decoding the
    // committed file under the schema is what catches it here instead.
    const committed = Object.fromEntries(
      readFileSync(ENV_DEVELOPMENT_PATH, 'utf8')
        .split('\n')
        .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );

    expect(Object.keys(committed)).toEqual(
      Object.keys(DEV_ENVIRONMENT).filter(
        (name) => DEV_ENVIRONMENT[name as keyof typeof DEV_ENVIRONMENT],
      ),
    );
    expect(() =>
      Schema.decodeUnknownSync(EnvironmentSchema)(committed),
    ).not.toThrow();
  });

  it('keeps every development value out of the boundary’s source', () => {
    // `src/env.ts` imports `src/env/schema.ts`, so anything either module
    // holds is compiled into the production server bundle — which is how the
    // publicly-known development auth secret once shipped inside a built
    // deployable. The development lane's values live in `DEV_ENVIRONMENT`,
    // which only the generator and these suites import.
    //
    // Read as text rather than through the schema, because the reachable
    // declaration is not the only way in: a value pasted as a literal, a
    // `Schema.filter` comparing against one, or a default would never appear
    // in `describeEnvironment()` and would ship all the same. What the
    // bundler inlines is the source of these two files, so that is what is
    // searched.
    const source = [SCHEMA_MODULE, BOUNDARY_MODULE]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    for (const [name, value] of Object.entries(DEV_ENVIRONMENT)) {
      // `development`, `managed`, `1` and `false` are also legitimate
      // `example` placeholders, and a short value would match by accident.
      if (value.length < 12) continue;
      expect({ name, inTheSource: source.includes(value) }).toEqual({
        name,
        inTheSource: false,
      });
    }
  });

  it('keeps every development value out of what the schema declares', () => {
    // The same rule at the other end: a value that reached an annotation
    // through an import the source search cannot see (a constant re-exported
    // from somewhere else) shows up here, in what the schema actually holds.
    const declared = JSON.stringify(describeEnvironment());
    for (const [name, value] of Object.entries(DEV_ENVIRONMENT)) {
      if (value.length < 12) continue;
      expect({ name, inTheSchema: declared.includes(value) }).toEqual({
        name,
        inTheSchema: false,
      });
    }
  });

  it('omits the development marker from the deployer template', () => {
    // Setting it in a deployment is refused at boot; suggesting it would be
    // an invitation to do exactly that.
    expect(renderEnvExample()).not.toContain('STUDIO_DEV_DEFAULTS');
  });
});
