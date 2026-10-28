import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import { REDUCED_MOTION_ATTRIBUTE } from '../reducedMotion';

const here = dirname(fileURLToPath(import.meta.url));
const tailwindRoot = dirname(
  fileURLToPath(import.meta.resolve('tailwindcss/package.json')),
);
const reducedMotionCss = resolve(
  here,
  '../../../../tooling/tailwind/fresco/reduced-motion.css',
);

type SystemPreference = 'reduce' | 'no-preference';
type ProviderSetting = 'user' | 'always' | 'never';

// Arbitrary properties need no theme, so the variants can be compiled on
// their own, and a custom property names which variant matched.
const CANDIDATES = [
  'motion-reduce:[--reduce:1]',
  'motion-safe:[--safe:1]',
] as const;

let sheet: CSSStyleSheet;

beforeAll(async () => {
  const compiler = await compile(
    `@import 'tailwindcss/utilities'; @import '${reducedMotionCss}';`,
    {
      base: here,
      loadStylesheet: async (id) => {
        const path =
          id === 'tailwindcss/utilities'
            ? resolve(tailwindRoot, 'utilities.css')
            : id;
        return {
          path,
          base: dirname(path),
          content: readFileSync(path, 'utf8'),
        };
      },
    },
  );
  const style = document.createElement('style');
  style.textContent = compiler.build([...CANDIDATES]);
  document.head.append(style);
  sheet = style.sheet!;
});

/**
 * The declarations that reach `element` when the operating system reports
 * `system`. jsdom does not evaluate media queries, so this walks the compiled
 * sheet and decides each `prefers-reduced-motion` block itself; everything
 * else is jsdom's own selector matching.
 */
function appliedDeclarations(element: Element, system: SystemPreference) {
  const applied = new Map<string, string>();

  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        const condition = /prefers-reduced-motion:\s*([a-z-]+)/.exec(
          rule.media.mediaText,
        );
        if (!condition)
          throw new Error(`unexpected @media ${rule.media.mediaText}`);
        if (condition[1] === system) visit(rule.cssRules);
      } else if (rule instanceof CSSStyleRule) {
        if (!element.matches(rule.selectorText)) continue;
        for (const property of Array.from(rule.style)) {
          applied.set(property, rule.style.getPropertyValue(property).trim());
        }
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  visit(sheet.cssRules);

  return applied;
}

function variantsFor(setting: ProviderSetting, system: SystemPreference) {
  const root = document.documentElement;
  if (setting === 'user') root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
  else root.setAttribute(REDUCED_MOTION_ATTRIBUTE, setting);

  const element = document.createElement('div');
  element.className = CANDIDATES.join(' ');
  document.body.append(element);
  const applied = appliedDeclarations(element, system);
  element.remove();
  root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);

  return {
    reduce: applied.get('--reduce') === '1',
    safe: applied.get('--safe') === '1',
  };
}

describe('motion-reduce / motion-safe variants', () => {
  it.each(['reduce', 'no-preference'] as const)(
    'reduce under "always" whatever the system says (%s)',
    (system) => {
      expect(variantsFor('always', system)).toEqual({
        reduce: true,
        safe: false,
      });
    },
  );

  it.each(['reduce', 'no-preference'] as const)(
    'do not reduce under "never" whatever the system says (%s)',
    (system) => {
      expect(variantsFor('never', system)).toEqual({
        reduce: false,
        safe: true,
      });
    },
  );

  it('follow the system when no provider overrides it', () => {
    expect(variantsFor('user', 'reduce')).toEqual({
      reduce: true,
      safe: false,
    });
    expect(variantsFor('user', 'no-preference')).toEqual({
      reduce: false,
      safe: true,
    });
  });
});

describe('global reduced-motion rule', () => {
  function zeroesTransitions(
    setting: ProviderSetting,
    system: SystemPreference,
  ) {
    const root = document.documentElement;
    if (setting === 'user') root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);
    else root.setAttribute(REDUCED_MOTION_ATTRIBUTE, setting);

    const element = document.createElement('div');
    document.body.append(element);
    const applied = appliedDeclarations(element, system);
    element.remove();
    root.removeAttribute(REDUCED_MOTION_ATTRIBUTE);

    return applied.get('transition-duration') === '0s';
  }

  it('applies under "always" and never under "never"', () => {
    for (const system of ['reduce', 'no-preference'] as const) {
      expect(zeroesTransitions('always', system)).toBe(true);
      expect(zeroesTransitions('never', system)).toBe(false);
    }
  });

  it('follows the system when no provider overrides it', () => {
    expect(zeroesTransitions('user', 'reduce')).toBe(true);
    expect(zeroesTransitions('user', 'no-preference')).toBe(false);
  });
});
