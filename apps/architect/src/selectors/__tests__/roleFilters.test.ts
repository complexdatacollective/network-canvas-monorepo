import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { roleMapKey, type VariableRoleMap } from '../indexes';
import {
  hasConflictingUse,
  hasUnvalidatedUse,
  hasValidatedUse,
} from '../roleFilters';

const PERSON = { entity: 'node', type: 'person' };
const PLACE = { entity: 'node', type: 'place' };
const EGO = { entity: 'ego' };

// One variable id, three different subject scopings and three different role
// mixes — so a predicate that ignores the subject, or reads the wrong count,
// answers at least one of these wrongly.
const ROLE_MAP: VariableRoleMap = {
  [roleMapKey(PERSON, 'formOnly')]: { validated: 1, unvalidated: 0 },
  [roleMapKey(PERSON, 'binOnly')]: { validated: 0, unvalidated: 2 },
  [roleMapKey(PERSON, 'both')]: { validated: 1, unvalidated: 1 },
  [roleMapKey(PERSON, 'neither')]: { validated: 0, unvalidated: 0 },
  [roleMapKey(PLACE, 'formOnly')]: { validated: 0, unvalidated: 1 },
  [roleMapKey(EGO, 'formOnly')]: { validated: 0, unvalidated: 1 },
};

describe('hasValidatedUse / hasUnvalidatedUse', () => {
  it('answers for the role it names, not the other one', () => {
    expect(hasValidatedUse(ROLE_MAP, PERSON, 'formOnly')).toBe(true);
    expect(hasUnvalidatedUse(ROLE_MAP, PERSON, 'formOnly')).toBe(false);
    expect(hasValidatedUse(ROLE_MAP, PERSON, 'binOnly')).toBe(false);
    expect(hasUnvalidatedUse(ROLE_MAP, PERSON, 'binOnly')).toBe(true);
    expect(hasValidatedUse(ROLE_MAP, PERSON, 'both')).toBe(true);
    expect(hasUnvalidatedUse(ROLE_MAP, PERSON, 'both')).toBe(true);
  });

  it('reads a zero count as no use, and an absent entry the same way', () => {
    expect(hasValidatedUse(ROLE_MAP, PERSON, 'neither')).toBe(false);
    expect(hasUnvalidatedUse(ROLE_MAP, PERSON, 'neither')).toBe(false);
    expect(hasValidatedUse(ROLE_MAP, PERSON, 'absent')).toBe(false);
    expect(hasUnvalidatedUse(ROLE_MAP, PERSON, 'absent')).toBe(false);
  });

  // The whole point of `roleMapKey`: identically named variables on different
  // node/edge types (and on the ego) are different variables.
  it('scopes the answer to the subject', () => {
    expect(hasValidatedUse(ROLE_MAP, PLACE, 'formOnly')).toBe(false);
    expect(hasUnvalidatedUse(ROLE_MAP, PLACE, 'formOnly')).toBe(true);
    expect(hasValidatedUse(ROLE_MAP, EGO, 'formOnly')).toBe(false);
    expect(hasUnvalidatedUse(ROLE_MAP, EGO, 'formOnly')).toBe(true);
  });
});

describe('hasConflictingUse', () => {
  it('asks about the OPPOSITE class to the picker’s own', () => {
    // An unvalidated writer (a bin) conflicts with a form's validated use.
    expect(hasConflictingUse(ROLE_MAP, PERSON, 'formOnly', 'unvalidated')).toBe(
      true,
    );
    expect(hasConflictingUse(ROLE_MAP, PERSON, 'binOnly', 'unvalidated')).toBe(
      false,
    );
    // A validated writer (a form field) conflicts with a bin's unvalidated use.
    expect(hasConflictingUse(ROLE_MAP, PERSON, 'binOnly', 'validated')).toBe(
      true,
    );
    expect(hasConflictingUse(ROLE_MAP, PERSON, 'formOnly', 'validated')).toBe(
      false,
    );
  });
});

/**
 * The door closed behind the refactor that introduced these predicates.
 *
 * Twelve call sites used to index the role map by hand — the shape below —
 * and each one independently chose which count to read and whether to scope
 * by subject. A comment saying "read the map through the predicates" cannot
 * make that true; this can.
 *
 * The pattern is assembled at runtime so this file is not its own violation,
 * and `roleFilters.ts` is exempt because it is where the predicates live.
 */
describe('role map readers', () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const ALLOWED = ['selectors/roleFilters.ts'];
  // `map[roleMapKey(subject, id)]?.validated` — the read this seam replaced,
  // in any of its forms (`?.validated`, `?.unvalidated`, and the dynamic
  // `?.[conflictingRole]`). Deliberately NOT every `?.` after a `roleMapKey`
  // index: the exclusive-slot and interface-owned-option maps share the key
  // function and are read directly on purpose.
  const inlineRead = new RegExp(
    [
      'roleMapKey',
      '\\([^\\]]*\\)',
      '\\]',
      '\\?\\.',
      '(?:validated|unvalidated|\\[)',
    ].join(''),
  );

  const sourceFiles = readdirSync(SRC, {
    recursive: true,
    encoding: 'utf-8',
  }).filter((entry) => /\.tsx?$/.test(entry));

  it('finds the app source to scan', () => {
    // Without this, a bad SRC path would make every assertion below vacuous.
    expect(sourceFiles.length).toBeGreaterThan(500);
    expect(sourceFiles).toContain(join('selectors', 'roleFilters.ts'));
  });

  it('has no hand-rolled role-map read outside the predicates', () => {
    const offenders = sourceFiles.filter((entry) => {
      const posix = entry.split('\\').join('/');
      if (ALLOWED.includes(posix)) return false;
      if (posix === relative(SRC, fileURLToPath(import.meta.url))) return false;
      // Collapsed so a prettier-wrapped expression still reads as one.
      return inlineRead.test(
        readFileSync(join(SRC, entry), 'utf-8').replace(/\s+/g, ' '),
      );
    });
    expect(offenders).toEqual([]);
  });

  it('would catch one if it came back', () => {
    // The oracle above is a negative assertion, so prove it can fire.
    const reintroduced =
      'const conflicted = (roleMap[roleMapKey(subject, id)]?.validated ?? 0) > 0;';
    expect(inlineRead.test(reintroduced.replace(/\s+/g, ' '))).toBe(true);
  });
});
