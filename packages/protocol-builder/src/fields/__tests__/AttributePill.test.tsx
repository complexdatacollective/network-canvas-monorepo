import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { VariableType } from '@codaco/protocol-validation';

import AttributePill from '../AttributePill.tsx';

/**
 * What a researcher can see about an attribute without reading its name, and
 * what Architect has shown them for it since its codebook editor was written:
 * one icon per kind of answer, one accent colour per kind of answer.
 *
 * Pinned here because it is the only thing the pill says at a glance in a list
 * of three dozen attributes, and because the two halves drift independently —
 * a mapping typo that hands the ordinal the categorical's icon is invisible to
 * every other test in the package, all of which read the name.
 */
const EXPECTED: ReadonlyArray<
  readonly [type: VariableType, iconFile: string, accentToken: string]
> = [
  ['boolean', 'boolean-variable.svg', '--neon-carrot'],
  ['categorical', 'categorical-variable.svg', '--mustard'],
  ['datetime', 'date-variable.svg', '--tomato'],
  ['layout', 'layout-variable.svg', '--purple-pizazz'],
  ['location', 'location-variable.svg', '--slate-blue--dark'],
  ['number', 'number-variable.svg', '--paradise-pink'],
  ['ordinal', 'ordinal-variable.svg', '--sea-green'],
  ['scalar', 'scalar-variable.svg', '--kiwi'],
  ['text', 'text-variable.svg', '--cerulean-blue'],
];

const ICON_FILES = [
  ...EXPECTED.map(([, iconFile]) => iconFile),
  'default-variable.svg',
];

const ICONS_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'icons',
);

/**
 * A fragment of the named icon file that appears in no other one, read from
 * the file itself so the check is against the asset rather than against a
 * second copy of the mapping.
 *
 * Needed because the bundler decides how the asset reaches the `src`: a small
 * SVG arrives inlined as a `data:` URI with its whitespace collapsed and its
 * quotes re-spelled, a larger one as a path. The longest run of drawing data
 * that no other icon contains survives both — and the uniqueness is what makes
 * the check per-type: every one of these files shares its XML preamble, so a
 * probe chosen by length alone would match all ten.
 */
const probeFor = (iconFile: string) => {
  const read = (file: string) =>
    // The inliner rewrites the file's double quotes as single ones so the URI
    // needs no escaping; the probes are normalised the same way.
    readFileSync(join(ICONS_DIRECTORY, file), 'utf8').replaceAll('"', "'");

  const others = ICON_FILES.filter((file) => file !== iconFile).map(read);
  const distinctive = read(iconFile)
    .split(/\s+/)
    .filter((token) => others.every((other) => !other.includes(token)))
    .reduce((best, token) => (token.length > best.length ? token : best), '');

  if (distinctive.length < 12) {
    throw new Error(`No distinctive fragment found in ${iconFile}.`);
  }
  return distinctive;
};

const pillOf = (container: HTMLElement) => {
  const pill = container.querySelector<HTMLElement>('data');
  if (!pill) throw new Error('The pill did not render.');
  return pill;
};

const iconSourceOf = (container: HTMLElement) => {
  const icon = container.querySelector('img');
  if (!icon) throw new Error('The pill rendered no icon.');
  return decodeURIComponent(icon.getAttribute('src') ?? '');
};

describe('AttributePill', () => {
  it.each(EXPECTED)(
    'shows a %s attribute with its own icon and its own accent',
    (type, iconFile, accentToken) => {
      const { container } = render(
        <AttributePill name="an_answer" type={type} />,
      );

      expect(
        pillOf(container).style.getPropertyValue('--variable-pill-accent'),
      ).toBe(`oklch(var(${accentToken}))`);
      expect(iconSourceOf(container)).toContain(probeFor(iconFile));
    },
  );

  it('gives every kind of answer a different icon and a different accent', () => {
    const icons = new Set<string>();
    const accents = new Set<string>();

    for (const [type] of EXPECTED) {
      const { container } = render(
        <AttributePill name="an_answer" type={type} />,
      );
      icons.add(iconSourceOf(container));
      accents.add(
        pillOf(container).style.getPropertyValue('--variable-pill-accent'),
      );
    }

    expect(icons.size).toBe(EXPECTED.length);
    expect(accents.size).toBe(EXPECTED.length);
  });

  it('takes the neutral mark where the kind of answer is not known', () => {
    const { container } = render(<AttributePill name="nickname" />);
    const pill = pillOf(container);

    expect(pill).not.toHaveAttribute('data-attribute-type');
    expect(pill.style.getPropertyValue('--variable-pill-accent')).toBe(
      'oklch(var(--charcoal))',
    );
    expect(iconSourceOf(container)).toContain(probeFor('default-variable.svg'));
  });

  it('says nothing to a screen reader about the kind of answer', () => {
    const { container } = render(
      <AttributePill name="age_at_interview" type="number" />,
    );

    // The row this renders inside is named by its content, so the icon must
    // contribute nothing: an `alt` of "number attribute" would make that row's
    // accessible name "number attribute age_at_interview".
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(pillOf(container)).toHaveTextContent('age_at_interview');
  });
});
