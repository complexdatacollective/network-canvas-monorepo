import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

/**
 * Renaming an attribute from the pill that shows it.
 *
 * Architect's own interaction (`components/VariablePill.tsx`'s `editable`
 * branch), and the ONLY way it offered to rename an existing attribute: its
 * codebook screen had no row editor, so a researcher who mistyped a name met
 * it here or not at all.
 */
describe('renaming an attribute from its pill', () => {
  const takeIt = () => Promise.resolve(true);

  const openTheEditor = async (
    props: Partial<Parameters<typeof AttributePill>[0]> = {},
  ) => {
    const user = userEvent.setup();
    render(
      <AttributePill
        name="age"
        type="number"
        editable
        onRename={takeIt}
        {...props}
      />,
    );
    const trigger = screen.getByRole('button', {
      name: 'Edit attribute name: age',
    });
    await user.click(trigger);
    return { user, trigger };
  };

  it('offers no button at all where nothing may be written', () => {
    render(<AttributePill name="age" type="number" />);
    expect(screen.queryByRole('button')).toBeNull();
    // Still the statement it was: a `<data>` carrying the name.
    expect(screen.getByText('age')).toBeInTheDocument();
  });

  it('opens the editor on the name it already holds, and says so', async () => {
    await openTheEditor();

    const box = await screen.findByRole('textbox', {
      name: 'Attribute name',
    });
    expect(box).toHaveValue('age');
    expect(box).toHaveFocus();
    expect(
      screen.getByRole('dialog', { name: 'Edit attribute name' }),
    ).toBeInTheDocument();
    // Said aloud, because the pill has become an editor over the page.
    expect(screen.getByText('Editing attribute age')).toBeInTheDocument();
  });

  it('holds its save until the name has actually changed', async () => {
    const { user } = await openTheEditor();
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });
    const save = screen.getByRole('button', { name: 'Save Changes' });

    expect(save).toBeDisabled();
    await user.type(box, '_at_interview');
    expect(save).toBeEnabled();
    // And back again: a name typed and untyped is the name it started as.
    await user.clear(box);
    await user.type(box, 'age');
    expect(save).toBeDisabled();
  });

  it('refuses an empty name where it was typed', async () => {
    const { user } = await openTheEditor();
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.clear(box);

    expect(
      await screen.findByText('You must enter an attribute name'),
    ).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('states the caller’s own rule about the name, and blocks the save', async () => {
    const { user } = await openTheEditor({
      validateName: (typed) =>
        typed === 'height'
          ? 'this type already has an attribute called that'
          : undefined,
    });
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.clear(box);
    await user.type(box, 'height');

    expect(
      await screen.findByText('this type already has an attribute called that'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('writes the new name and says it was renamed, once', async () => {
    const onRename = vi.fn(takeIt);
    const { user, trigger } = await openTheEditor({ onRename });
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.clear(box);
    await user.type(box, 'age_at_interview');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onRename).toHaveBeenCalledExactlyOnceWith('age_at_interview');
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Attribute name' }),
      ).toBeNull(),
    );
    // The one sentence there is to say. A close is one act however it was
    // asked for, and the dismissal the save's own close provokes must not add
    // "cancelled" after it.
    expect(
      screen.getByText('Attribute renamed to age_at_interview'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Attribute name edit cancelled'),
    ).not.toBeInTheDocument();
    // And focus is back where the researcher left it.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('leaves the name alone when the editor is dismissed, and says so', async () => {
    const onRename = vi.fn(takeIt);
    const { user, trigger } = await openTheEditor({ onRename });
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.clear(box);
    await user.type(box, 'something_else');
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Attribute name' }),
      ).toBeNull(),
    );
    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.getByText('Attribute name edit cancelled'),
    ).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    // And the pill still shows the name the codebook holds, so reopening it
    // starts from there rather than from the abandoned draft.
    await user.click(trigger);
    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('age');
  });

  it('keeps a refused rename on screen, with what the researcher typed', async () => {
    const onRename = vi.fn(() => Promise.resolve(false));
    const { user } = await openTheEditor({ onRename });
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.clear(box);
    await user.type(box, 'age_at_interview');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save Changes' }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'age_at_interview',
    );
    expect(
      screen.queryByText('Attribute renamed to age_at_interview'),
    ).not.toBeInTheDocument();
  });

  /** Enter is the keyboard's Save, and only where there is something to save. */
  it('saves on Enter, and does nothing on Enter with no change', async () => {
    const onRename = vi.fn(takeIt);
    const { user } = await openTheEditor({ onRename });
    const box = await screen.findByRole('textbox', { name: 'Attribute name' });

    await user.type(box, '{Enter}');
    expect(onRename).not.toHaveBeenCalled();

    await user.type(box, '_at_interview{Enter}');
    expect(onRename).toHaveBeenCalledExactlyOnceWith('age_at_interview');
  });
});
