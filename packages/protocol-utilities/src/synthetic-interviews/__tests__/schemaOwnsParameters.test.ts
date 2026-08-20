import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CurrentProtocolSchema } from '@codaco/protocol-validation';

import { DEFAULT_SYNTHETIC_SEED, MAX_SYNTHETIC_INTERVIEWS } from '../constants';
import { invariant } from '../utils/invariant';

/**
 * The guard for the invariant the schema-owned-parameters work exists to
 * establish: every parameter that shapes synthetic data is defined in
 * `@codaco/protocol-validation`, and this package holds none of its own.
 *
 * Written as a test over SOURCE rather than over behaviour, deliberately. The
 * failure it catches is a default quietly reappearing on the generation side —
 * which by construction produces no wrong answer of its own, only a right
 * answer that overrules what the protocol said. Three such defaults reached
 * `main` before this existed, each found by accident:
 *
 *   - DEFAULT_MAX_SELECTED capped a declared `selectionCount` of 4 at 2
 *   - NUMBER_DEFAULT_RANGE capped a declared `constant: 250` at 80
 *   - the decade-back date default clipped a declared 1990-1995 range
 *
 * See docs/superpowers/specs/2026-08-19-synthetic-parameters-in-schema-design.md
 */

const syntheticInterviews = path.resolve(import.meta.dirname, '..');

/**
 * Every source file generation runs from. Tests are left out deliberately:
 * a fixture is allowed to state a number, and the claim being made is about
 * the code that draws.
 */
const sourceFiles = readdirSync(syntheticInterviews, { recursive: true })
  .filter((entry): entry is string => typeof entry === 'string')
  .filter((entry) => entry.endsWith('.ts'))
  .filter((entry) => !entry.split(path.sep).includes('__tests__'))
  .filter((entry) => entry !== 'constants.ts')
  .map((entry) => path.join(syntheticInterviews, entry))
  .toSorted();

/**
 * What a generation run is configured with, as opposed to what a protocol
 * says. These are properties of asking for synthetic data — how many
 * interviews, which seed — and belong to the caller rather than to the
 * document, so they are the only constants this package may hold.
 */
const RUN_OPTIONS = ['MAX_SYNTHETIC_INTERVIEWS', 'DEFAULT_SYNTHETIC_SEED'];

describe('the schema owns every generation parameter', () => {
  it('leaves this package holding only run options', () => {
    const source = readFileSync(
      path.join(syntheticInterviews, 'constants.ts'),
      'utf8',
    );
    const exported = [...source.matchAll(/^export const (\w+)/gm)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined);

    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(exported.toSorted(byName)).toEqual(RUN_OPTIONS.toSorted(byName));
  });

  it('pins the run options to their agreed values', () => {
    // The source scan above reads `constants.ts` as text, which proves nothing
    // about what the values ARE. These two are the run's whole configurable
    // surface, and both are agreed numbers: 1000 is the ceiling a caller may
    // ask for, and 42 is the seed a run falls back to, so an unseeded run is
    // reproducible across machines and releases.
    //
    // Importing them (rather than re-reading the file) is also what keeps this
    // package's new files reachable: protocol-utilities has no knip workspace
    // block, so default unused-file analysis applies and a source file no
    // module imports is reported. `invariant` is exercised here for the same
    // reason until the engine consumes it.
    expect(MAX_SYNTHETIC_INTERVIEWS).toBe(1000);
    expect(DEFAULT_SYNTHETIC_SEED).toBe(42);
    expect(() => invariant(true, 'unused')).not.toThrow();
  });

  it('leaves no descriptor read with a fallback of its own', () => {
    // Every generation-side default the spec names, by the name it had. Each
    // is now a read of the descriptor `resolveVariableSynthetic` resolves, so
    // the name reappearing anywhere under `synthetic-interviews/` means one
    // came back — which is the failure this whole file exists to catch, since
    // a reintroduced default produces no wrong answer of its own, only a right
    // answer that overrules what the protocol said.
    const retired = [
      'NUMBER_DEFAULT_RANGE',
      'NUMBER_OPEN_RANGE',
      'DEFAULT_MAX_SELECTED',
      'DATE_DEFAULT_REACH',
      'defaultDateSpan',
      'inferredSelectionCount',
      'inferGenerator',
    ];

    // A fallback standing between a resolved value and the value drawn is the
    // shape all three known bugs took. Not every `??` in the package is one —
    // an open-tailed distribution names no bound on its unbounded side, and the
    // window's own bound standing in for it is an INTERSECTION rather than a
    // default — so these ask a precise question: does anything read a field off
    // something the schema resolved and then supply its own value for it?
    //
    // Keyed on what is being READ rather than on the reader's variable name. An
    // earlier version matched only identifiers literally spelled `descriptor`,
    // which let `stage.synthetic.responseBurden ?? 99` straight through — the
    // exact mutation class this test exists to catch, and one no behavioural
    // test can catch either, because a fallback on a value that is always
    // present is dead code until the day it isn't.
    const fallbacks = [
      // `x.synthetic.y ?? z`, `descriptor.min ?? 0`, `resolved?.max ?? 80`
      {
        pattern:
          /(?:\bsynthetic\b|\bdescriptor\b|\bresolved\w*\b|descriptorOf\([^)]*\))\??\.[\w.?]+\s*\?\?/,
        complaint: 'applies ?? to a resolved value',
      },
      // `const { min = 5 } = descriptorOf(...)` — the same default, destructured
      {
        pattern:
          /const\s*\{[^}]*=\s*[^}]*\}\s*=\s*(?:\w*[Dd]escriptor|\w*[Ss]ynthetic|resolve\w*)/,
        complaint: 'destructures a resolved value with a default',
      },
      // `Math.max(descriptor.min, 18)` — the spec names clamps explicitly
      {
        pattern:
          /Math\.(?:max|min)\([^)]*(?:\bsynthetic\b|\bdescriptor\b)\??\.[\w.?]+[^)]*,\s*-?\d/,
        complaint: 'clamps a resolved value against a literal',
      },
      // `Math.max(18, descriptor.min)` — the same clamp, literal first
      {
        pattern:
          /Math\.(?:max|min)\(\s*-?\d[^)]*,[^)]*(?:\bsynthetic\b|\bdescriptor\b)\??\.[\w.?]+/,
        complaint: 'clamps a resolved value against a leading literal',
      },
    ];

    /**
     * One aliasing assignment is all it takes to slip past receiver-keyed
     * patterns: `const b = stage.synthetic; b.responseBurden ?? 99` reads a
     * resolved value through a name none of the patterns above know. So any
     * identifier bound to a resolved value is put through the same three
     * questions under its own name. Parameters are out of reach of this
     * net (a descriptor passed INTO a function keeps its open-tail identity
     * reads, e.g. `sampleCount`'s `count.min ?? 0`) — the boundary between
     * alias and parameter is exactly the boundary between "supplied a value
     * of its own" and "intersected with the window it was given".
     */
    const aliasFallbacksFor = (alias: string) => [
      {
        pattern: new RegExp(`\\b${alias}\\??\\.[\\w.?]+\\s*\\?\\?`),
        complaint: `applies ?? to \`${alias}\`, an alias of a resolved value`,
      },
      {
        pattern: new RegExp(
          `Math\\.(?:max|min)\\([^)]*\\b${alias}\\??\\.[\\w.?]+[^)]*,\\s*-?\\d`,
        ),
        complaint: `clamps \`${alias}\` (alias of a resolved value) against a literal`,
      },
      {
        pattern: new RegExp(
          `Math\\.(?:max|min)\\(\\s*-?\\d[^)]*,[^)]*\\b${alias}\\??\\.[\\w.?]+`,
        ),
        complaint: `clamps \`${alias}\` (alias of a resolved value) against a leading literal`,
      },
      {
        pattern: new RegExp(
          `const\\s*\\{[^}]*=\\s*[^}]*\\}\\s*=\\s*${alias}\\b`,
        ),
        complaint: `destructures \`${alias}\` (alias of a resolved value) with a default`,
      },
    ];

    // Sizes the distinct-value sequence a `unique` text variable walks rather
    // than the shape of a drawn value — `textDrawLength` is read only by
    // `distinctText` and by the count that sizes it — so it is a run limit
    // rather than a parameter, and stays. Listed here so that a genuine
    // default named `DEFAULT_*` cannot hide behind it.
    const runLimits = new Set(['DEFAULT_TEXT_LENGTH']);

    // A scan over nothing has no offences to find, so it would pass vacuously.
    expect(sourceFiles.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const file of sourceFiles) {
      const source = readFileSync(file, 'utf8');
      const where = path.relative(syntheticInterviews, file);

      for (const name of retired) {
        if (new RegExp(`\\b${name}\\b`).test(source)) {
          offences.push(`${where} still names ${name}`);
        }
      }
      for (const { pattern, complaint } of fallbacks) {
        if (pattern.test(source)) offences.push(`${where} ${complaint}`);
      }
      const aliases = [
        ...source.matchAll(
          /(?:const|let)\s+(\w+)\s*=\s*[^;\n]*(?:\.synthetic\b|\bdescriptorOf\(|\bresolveVariableSynthetic\()/g,
        ),
      ]
        .map(([, name]) => name)
        .filter((name): name is string => name !== undefined)
        // Names the receiver-keyed patterns already watch add nothing.
        .filter((name) => name !== 'synthetic' && name !== 'descriptor');
      for (const alias of new Set(aliases)) {
        for (const { pattern, complaint } of aliasFallbacksFor(alias)) {
          if (pattern.test(source)) offences.push(`${where} ${complaint}`);
        }
      }
      for (const [, declared] of source.matchAll(/const (DEFAULT_\w+)/g)) {
        if (declared !== undefined && !runLimits.has(declared)) {
          offences.push(`${where} declares a default of its own: ${declared}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });
});

/**
 * Every bundled protocol still parses.
 *
 * The failure mode this guards is specific: a resolved default that
 * contradicts a variable's own rules turns a protocol that was valid into one
 * that is refused, and the schema's refusals are addressed to an author who
 * wrote nothing. Categorical bins are the canary: the bundled corpus bins
 * categorical variables that a selection-count default of "1 or 2" would take
 * down. `resolveVariableSynthetic.test.ts` pins how many there are and proves
 * the derivation cannot produce such a default; this half proves the corpus
 * still parses either way.
 *
 * Reads the JSON by relative path rather than through a dependency, following
 * `bundled-protocols-role-conflicts.test.ts`: packages/protocols is pure data
 * with no test runner of its own.
 */
const protocolsRoot = path.resolve(
  import.meta.dirname,
  '../../../../protocols',
);

const protocolFiles = readdirSync(protocolsRoot, { recursive: true })
  .filter((entry): entry is string => typeof entry === 'string')
  .filter((entry) => path.basename(entry) === 'protocol.json')
  .map((entry) => path.join(protocolsRoot, entry))
  .toSorted();

describe('resolution keeps every bundled protocol valid', () => {
  it('discovered at least one bundled protocol.json', () => {
    expect(protocolFiles.length).toBeGreaterThan(0);
  });

  it.each(protocolFiles)('%s parses', (protocolFile) => {
    const protocol: unknown = JSON.parse(readFileSync(protocolFile, 'utf8'));
    const result = CurrentProtocolSchema.safeParse(protocol);

    expect(
      result.success ? [] : result.error.issues,
      result.success ? '' : JSON.stringify(result.error.issues, null, 2),
    ).toEqual([]);
  });

  it.each(protocolFiles)(
    '%s parses to the same thing twice',
    (protocolFile) => {
      // Resolution must be idempotent: a protocol that has been through the
      // parser once is a protocol a host may hand back, and re-parsing it must
      // not resolve anything a second time or resolve it differently.
      const protocol: unknown = JSON.parse(readFileSync(protocolFile, 'utf8'));
      const once = CurrentProtocolSchema.safeParse(protocol);
      if (!once.success) return;

      const twice = CurrentProtocolSchema.safeParse(once.data);

      expect(twice.success).toBe(true);
      expect(twice.success ? twice.data : undefined).toStrictEqual(once.data);
    },
  );
});
