import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  dynamicAttributePillName,
  VariableKindMark,
  VariablePill,
  variablePillDescription,
  type VariablePillKind,
  type VariablePillProps,
  variablePillSpec,
} from '../VariablePill.tsx';

/**
 * What a researcher can see about an attribute without reading its name: one
 * mark per kind, one accent colour per kind. Pinned here because it is the
 * only thing the pill says at a glance in a list of three dozen attributes,
 * and because the two halves drift independently — a mapping typo that hands
 * the ordinal the categorical's mark is invisible to every other test in the
 * package, all of which read the name.
 */
const EXPECTED: ReadonlyArray<
  readonly [kind: VariablePillKind, iconFile: string, accent: string]
> = [
  ['boolean', 'boolean-variable.svg', 'oklch(var(--neon-carrot))'],
  ['categorical', 'categorical-variable.svg', 'oklch(var(--mustard))'],
  ['datetime', 'date-variable.svg', 'oklch(var(--tomato))'],
  ['layout', 'layout-variable.svg', 'oklch(var(--purple-pizazz))'],
  ['location', 'location-variable.svg', 'oklch(var(--slate-blue--dark))'],
  ['number', 'number-variable.svg', 'oklch(var(--paradise-pink))'],
  ['ordinal', 'ordinal-variable.svg', 'oklch(var(--sea-green))'],
  ['scalar', 'scalar-variable.svg', 'oklch(var(--kiwi))'],
  ['text', 'text-variable.svg', 'oklch(var(--cerulean-blue))'],
  ['dynamic', 'dynamic-variable.svg', 'oklch(var(--navy-taupe))'],
  ['placeholder', 'placeholder-variable.svg', 'oklch(var(--sea-serpent))'],
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

const accentClass = (colour: string) => `[--variable-pill-accent:${colour}]`;

/**
 * A fragment of the named icon file that appears in no other one, read from
 * the file itself so the check is against the asset rather than against a
 * second copy of the mapping. The bundler decides how the asset reaches the
 * `src` (a small SVG arrives inlined as a `data:` URI with its quotes
 * re-spelled, a larger one as a path); the longest run of drawing data that
 * no other icon contains survives both.
 */
const probeFor = (iconFile: string) => {
  const read = (file: string) =>
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

/**
 * Builds the DOM that ProseMirror's `DOMSerializer.renderSpec` builds from a
 * specification: an element per array, attributes from the second entry,
 * strings as text.
 */
const domFromSpec = (spec: unknown): Node => {
  if (typeof spec === 'string') return document.createTextNode(spec);
  if (!Array.isArray(spec)) throw new Error('Not a DOM specification.');
  const [tag, attributes, ...children] = spec as [
    string,
    Record<string, string>,
    ...unknown[],
  ];
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  for (const child of children) element.append(domFromSpec(child));
  return element;
};

/**
 * The words a screen reader reads from the pill: its text, leaving out
 * whatever is hidden from assistive technology, with runs of space as one.
 */
const spokenText = (root: Node): string => {
  const read = (node: Node): string => {
    if (node instanceof Element) {
      if (node.getAttribute('aria-hidden') === 'true') return '';
      if (node instanceof HTMLImageElement) return node.alt;
      return [...node.childNodes].map(read).join('');
    }
    return node.textContent ?? '';
  };
  return read(root).replace(/\s+/g, ' ').trim();
};

/** Every element's tag and attributes, in document order, sorted by name. */
const shapeOf = (root: Element) =>
  [root, ...root.querySelectorAll('*')].map((element) => ({
    tag: element.tagName,
    attributes: Object.fromEntries(
      [...element.attributes]
        .map((attribute) => [attribute.name, attribute.value] as const)
        .toSorted(([first], [second]) => first.localeCompare(second)),
    ),
    text: element.children.length === 0 ? element.textContent : undefined,
  }));

describe('VariablePill', () => {
  it.each(EXPECTED)(
    'shows a %s pill with its own mark and its own accent',
    (kind, iconFile, accent) => {
      const { container } = render(
        <VariablePill name="an_answer" kind={kind} />,
      );

      expect(pillOf(container)).toHaveClass(accentClass(accent));
      expect(pillOf(container)).toHaveAttribute('data-attribute-type', kind);
      expect(iconSourceOf(container)).toContain(probeFor(iconFile));
    },
  );

  it('gives every kind a different mark and a different accent', () => {
    const icons = new Set<string>();
    const accents = new Set<string>();

    for (const [kind] of EXPECTED) {
      const { container } = render(
        <VariablePill name="an_answer" kind={kind} />,
      );
      icons.add(iconSourceOf(container));
      const accent = [...pillOf(container).classList].find((name) =>
        name.startsWith('[--variable-pill-accent:'),
      );
      accents.add(accent ?? '');
    }

    expect(icons.size).toBe(EXPECTED.length);
    expect(accents.size).toBe(EXPECTED.length);
  });

  it('takes the neutral mark where the kind is not known', () => {
    const { container } = render(<VariablePill name="nickname" />);
    const pill = pillOf(container);

    expect(pill).not.toHaveAttribute('data-attribute-type');
    expect(pill).toHaveClass(accentClass('oklch(var(--charcoal))'));
    expect(iconSourceOf(container)).toContain(probeFor('default-variable.svg'));
  });

  it('wears the destructive accent when the attribute is missing, whatever its kind', () => {
    const { container } = render(
      <VariablePill name="closeness" kind="ordinal" missing />,
    );
    const pill = pillOf(container);

    expect(pill).toHaveAttribute('data-attribute-missing', '');
    expect(pill).toHaveClass(accentClass('var(--destructive)'));
    expect(pill).not.toHaveClass(accentClass('oklch(var(--sea-green))'));
  });

  it('draws a dashed pill with braces and no fill', () => {
    const { container } = render(
      <VariablePill name="Choose an attribute" dashed size="sm" />,
    );
    const pill = pillOf(container);

    expect(pill).toHaveClass('border-dashed');
    expect(pill).not.toHaveClass('bg-(--variable-pill-accent)');
    expect(container.querySelector('img')).toBeNull();
    expect(pill.querySelector('[aria-hidden="true"]')).toHaveTextContent('{ }');
  });

  it('says nothing to a screen reader about the kind, unless asked to', () => {
    const { container, rerender } = render(
      <VariablePill name="age_at_interview" kind="number" />,
    );

    // A row this renders inside is named by its content, so the mark must
    // contribute nothing: "number attribute age_at_interview" is not the
    // name of the attribute.
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(container.querySelector('img')?.parentElement).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(pillOf(container)).toHaveTextContent(/^age_at_interview$/);

    rerender(
      <VariablePill name="age_at_interview" kind="number" describeKind />,
    );
    const description = pillOf(container).querySelector('.sr-only');
    expect(description).toHaveTextContent(/^\(attribute type: Number\)$/);
    expect(description).toHaveAttribute('lang', 'en');
  });

  it.each([
    ['an attribute', { name: 'age_at_interview', kind: 'number' }],
    ['a dynamic attribute', { name: 'their / her / his', kind: 'dynamic' }],
    ['a deleted attribute', { name: 'closeness', missing: true }],
    ['a placeholder', { name: 'Name', kind: 'placeholder' }],
  ] as const)(
    'says the name of %s once, then its kind, to a screen reader',
    (_, props) => {
      const { container } = render(<VariablePill {...props} describeKind />);
      const spoken = spokenText(pillOf(container));
      expect(spoken).toBe(variablePillDescription(props));
      expect(spoken.split(props.name)).toHaveLength(2);
    },
  );

  it.each([
    [
      'the React pill',
      (props: VariablePillProps) => {
        const { container } = render(<VariablePill {...props} />);
        return pillOf(container);
      },
    ],
    [
      'the editor pill',
      (props: VariablePillProps) => {
        const built = domFromSpec(variablePillSpec(props));
        if (!(built instanceof Element)) throw new Error('No element.');
        return built;
      },
    ],
  ] as const)('says an inline pill’s name once in %s', (_, draw) => {
    const props: VariablePillProps = {
      name: 'their / her / his',
      kind: 'dynamic',
      size: 'inline',
      describeKind: true,
    };
    expect(spokenText(draw(props))).toBe(
      'their / her / his (dynamic attribute)',
    );
  });

  it('says a dynamic attribute and a missing one in plain English', () => {
    const { container, rerender } = render(
      <VariablePill name="their / her / his" kind="dynamic" describeKind />,
    );
    expect(pillOf(container).querySelector('.sr-only')).toHaveTextContent(
      /^\(dynamic attribute\)$/,
    );

    rerender(<VariablePill name="closeness" missing describeKind />);
    expect(pillOf(container).querySelector('.sr-only')).toHaveTextContent(
      /^\(attribute is no longer in the codebook\)$/,
    );
  });

  it('gives a name in the interface’s words the interface’s language', () => {
    const { container } = render(
      <VariablePill
        name="تاريخ اليوم"
        kind="datetime"
        lang="ar"
        dir="rtl"
        size="inline"
      />,
    );
    const name = container.querySelector('[lang="ar"]');
    expect(name).toHaveTextContent('تاريخ اليوم');
    expect(name).toHaveAttribute('dir', 'rtl');
    expect(name).toHaveClass('text-match-parent');
  });

  it('reads a name in its own direction, on the side of the interface', () => {
    const { container } = render(
      <VariablePill name="عمر" kind="number" size="inline" />,
    );
    const name = container.querySelector('[dir="auto"]');

    expect(name).toHaveTextContent('عمر');
    expect(name).toHaveClass('text-match-parent');
  });
});

describe('variablePillSpec', () => {
  const CASES: readonly (readonly [string, VariablePillProps])[] = [
    ['a text attribute', { name: 'name', kind: 'text' }],
    ['an inline pill', { name: 'name', kind: 'text', size: 'inline' }],
    [
      'a dynamic attribute with its description',
      {
        name: 'their / her / his',
        kind: 'dynamic',
        size: 'inline',
        describeKind: true,
      },
    ],
    ['a missing attribute', { name: 'gone', missing: true, size: 'sm' }],
    ['a pill with no kind', { name: 'nickname', size: 'md' }],
    [
      'a pill in the interface’s language',
      {
        name: 'Today’s date',
        kind: 'datetime',
        size: 'inline',
        lang: 'en',
        dir: 'ltr',
      },
    ],
    [
      'a dashed pill',
      { name: 'Choose an attribute', dashed: true, size: 'sm' },
    ],
    [
      'a pill with extra classes',
      { name: 'name', kind: 'text', className: 'max-w-64' },
    ],
  ];

  it.each(CASES)(
    'builds the same element tree, classes and attributes as the React pill for %s',
    (_, props) => {
      const { container } = render(<VariablePill {...props} />);
      const fromSpec = domFromSpec(variablePillSpec(props));
      if (!(fromSpec instanceof Element)) {
        throw new Error('The specification did not build an element.');
      }

      expect(shapeOf(fromSpec)).toEqual(shapeOf(pillOf(container)));
    },
  );
});

describe('VariableKindMark', () => {
  it.each(EXPECTED)(
    'marks a %s attribute with the mark and accent of its pill',
    (kind, iconFile, accent) => {
      const { container } = render(<VariableKindMark kind={kind} />);
      const mark = container.querySelector<HTMLElement>(
        '[data-variable-kind-mark]',
      );
      if (mark === null) throw new Error('The mark did not render.');

      expect(mark).toHaveAttribute('aria-hidden', 'true');
      expect(mark).toHaveClass(accentClass(accent));
      expect(iconSourceOf(container)).toContain(probeFor(iconFile));
    },
  );
});

describe('dynamicAttributePillName', () => {
  it('lists the distinct wordings in branch order', () => {
    expect(dynamicAttributePillName(['their', 'her', 'his', 'her'])).toBe(
      'their / her / his',
    );
  });

  it('leaves out wordings that are blank', () => {
    expect(dynamicAttributePillName(['school', ' ', 'work '])).toBe(
      'school / work',
    );
  });

  it('ends in an ellipsis after 30 characters', () => {
    expect(
      dynamicAttributePillName(['partner', 'friend', 'colleague', 'neighbour']),
    ).toBe('partner / friend / colleague…');
  });

  it('counts characters as a reader does, never cutting one in half', () => {
    // Each "é" here is two code points: an "e" and a combining acute accent.
    const accented = 'é'.repeat(31);
    const name = dynamicAttributePillName([accented]);

    expect(name).toBe(`${'é'.repeat(30)}…`);
  });
});
