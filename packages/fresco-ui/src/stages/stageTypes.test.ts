import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';

import {
  isStageType,
  STAGE_TYPES,
  stageColorStyle,
  stageIcon,
  stageTypeColorStyle,
  stageTypeIcon,
} from './stageTypes';

/**
 * The stage-type tokens, resolved from this file so the path cannot drift
 * with a working directory.
 */
const INTERFACES_CSS = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../tooling/tailwind/shared/interfaces.css',
  ),
  'utf8',
);

/** Every `--interface-*` variable the stylesheet declares a value for. */
const declaredVariables = new Set(
  [...INTERFACES_CSS.matchAll(/^\s*--(interface-[a-z-]+):/gm)].map(
    ([, name]) => name,
  ),
);

/** Every `--color-interface-*` alias and the variable it points at. */
const themeAliases = new Map(
  [
    ...INTERFACES_CSS.matchAll(
      /^\s*--color-(interface-[a-z-]+):\s*var\(\s*--(interface-[a-z-]+)\s*\);/gm,
    ),
  ].map(([, alias, target]) => [alias, target]),
);

const types = Object.keys(STAGE_TYPES) as StageType[];

describe('STAGE_TYPES', () => {
  it('covers all 21 stage types', () => {
    expect(types).toHaveLength(21);
  });

  it('names each token after its stage type', () => {
    for (const type of types) {
      const kebab = type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      expect(STAGE_TYPES[type].token).toBe(kebab);
    }
  });

  it('has a background and a foreground for every stage type, and nothing else', () => {
    const expected = types.flatMap((type) => [
      `interface-${STAGE_TYPES[type].token}`,
      `interface-${STAGE_TYPES[type].token}-contrast`,
    ]);

    expect([...declaredVariables].toSorted()).toEqual(expected.toSorted());
  });

  it('gives every token a Tailwind colour alias that reads it', () => {
    for (const variable of declaredVariables) {
      expect(themeAliases.get(variable)).toBe(variable);
    }
    expect(themeAliases.size).toBe(declaredVariables.size);
  });

  it('gives every stage type a distinct icon', () => {
    const icons = types.map(stageTypeIcon);

    expect(new Set(icons).size).toBe(icons.length);
  });

  it('recognises schema stage types and nothing else', () => {
    expect(isStageType('Sociogram')).toBe(true);
    expect(isStageType('FutureInterface')).toBe(false);
    expect(isStageType('toString')).toBe(false);
  });

  it('resolves a stage type to its token variables', () => {
    expect(stageTypeColorStyle('NameGeneratorQuickAdd')).toEqual({
      color: 'var(--interface-name-generator-quick-add)',
      contrast: 'var(--interface-name-generator-quick-add-contrast)',
    });
  });

  it('resolves a stage type to its icon component', () => {
    expect(stageTypeIcon('Sociogram')).toBe(STAGE_TYPES.Sociogram.icon);
  });
});

describe('stageColorStyle and stageIcon', () => {
  it('give a known stage type its own colours and icon', () => {
    expect(stageColorStyle('Sociogram')).toEqual(
      stageTypeColorStyle('Sociogram'),
    );
    expect(stageIcon('Sociogram')).toBe(STAGE_TYPES.Sociogram.icon);
  });

  it('give a stage type this build does not know a neutral grey and an icon no stage type uses', () => {
    expect(stageColorStyle('FutureInterface')).toEqual({
      color: 'oklch(var(--charcoal))',
      contrast: 'oklch(var(--white))',
    });
    const icons = new Set(Object.values(STAGE_TYPES).map(({ icon }) => icon));
    expect(icons.has(stageIcon('FutureInterface'))).toBe(false);
  });
});
