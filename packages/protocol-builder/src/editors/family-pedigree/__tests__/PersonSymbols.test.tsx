import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import {
  familyPedigreeEditor,
  shimMarkdownEditorMeasurement,
} from './editorFixtures.ts';
import { FAMILY_MEMBER_SECTION } from './pedigreeFixtures.ts';

shimMarkdownEditorMeasurement();

/** The standard sex assigned at birth symbols, for the fixture's options. */
const SEX_SYMBOLS = {
  default: 'diamond',
  dynamic: {
    variable: 'sexAssignedAtBirth',
    type: 'discrete',
    map: [
      { value: 'female', shape: 'circle' },
      { value: 'male', shape: 'square' },
      { value: 'intersex', shape: 'diamond' },
      { value: 'unknown', shape: 'diamond' },
      { value: 'preferNotToSay', shape: 'diamond' },
    ],
  },
};

/** The standard gender identity symbols, for the fixture's options and words. */
const GENDER_SYMBOLS = {
  default: 'diamond',
  dynamic: {
    variable: 'genderIdentity',
    type: 'discrete',
    map: [
      { value: 'woman', shape: 'circle' },
      { value: 'man', shape: 'square' },
      { value: 'nonBinary', shape: 'diamond' },
      { value: 'differentIdentity', shape: 'diamond' },
      { value: 'unknown', shape: 'diamond' },
      { value: 'preferNotToSay', shape: 'diamond' },
    ],
  },
};

const CODEBOOK = {
  notMappedCircle: 'Everyone is drawn as a circle.',
  notMappedDiamond: 'Everyone is drawn as a diamond.',
  customSex:
    'Follows sex assigned at birth, with shapes set differently in the codebook.',
  other: 'Follows the attribute is_ego, set in the codebook.',
} as const;

const OUT_OF_DATE =
  'Gender identity’s options or kinship words have changed since the symbols were set.';

const openFixture = async (
  options: Readonly<{ readOnly?: boolean }> = {},
): Promise<StageEditorHarness> => {
  const harness = renderStageEditor({
    stageId: 'family-pedigree-1',
    editor: familyPedigreeEditor,
    ...options,
  });
  await harness.opened();
  return harness;
};

const personType = (harness: StageEditorHarness): SectionDoc => {
  const section = harness.protocolSections()[FAMILY_MEMBER_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no family_member node type');
  }
  return section;
};

const shapeOf = (harness: StageEditorHarness): unknown =>
  personType(harness).shape;

/** The person type's shape, changed from outside the editor. */
const receiveShape = (harness: StageEditorHarness, shape: unknown): void => {
  harness.receiveCodebookUpdate({
    node: { family_member: { ...personType(harness), shape } },
  });
};

/** The symbols choice: one card per answer. */
const symbols = async () =>
  within(await screen.findByRole('listbox', { name: 'Symbols' }));

const OPTION = {
  sex: /^Sex assigned at birth/,
  gender: /^Gender identity/,
  codebook: /^Set in the codebook/,
} as const;

const option = async (name: RegExp) =>
  (await symbols()).getByRole('option', { name });

/** Waits for this answer to be the chosen one, and returns its card. */
const expectChosen = async (name: RegExp) => {
  let card: HTMLElement | undefined;
  await waitFor(async () => {
    card = await option(name);
    expect(card).toHaveAttribute('aria-selected', 'true');
  });
  return card as HTMLElement;
};

const choose = async (harness: StageEditorHarness, name: RegExp) => {
  await harness.user.click(await option(name));
};

describe('the pedigree symbols choice', () => {
  it('comes last in the person attributes, after the gender identity subsection', async () => {
    await openFixture();
    const listbox = await screen.findByRole('listbox', { name: 'Symbols' });
    const genderSwitch = screen.getByRole('switch', {
      name: 'Ask about gender identity',
    });
    const marker = screen.getByText('Participant marker', {
      selector: 'label',
    });
    expect(
      marker.compareDocumentPosition(genderSwitch) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      genderSwitch.compareDocumentPosition(listbox) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('draws symbols from sex assigned at birth when chosen, without asking', async () => {
    const harness = await openFixture();
    expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
      CODEBOOK.notMappedCircle,
    );

    await choose(harness, OPTION.sex);

    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectChosen(OPTION.sex);
  });

  it('draws symbols from gender identity and its kinship words when chosen', async () => {
    const harness = await openFixture();

    await choose(harness, OPTION.gender);

    await waitFor(() => expect(shapeOf(harness)).toEqual(GENDER_SYMBOLS));
    await expectChosen(OPTION.gender);
  });

  it('removes a mapping it set and keeps the default when set in the codebook is chosen', async () => {
    const harness = await openFixture();
    receiveShape(harness, SEX_SYMBOLS);
    await expectChosen(OPTION.sex);
    // Says what choosing it leaves everyone with.
    expect(await option(OPTION.codebook)).toHaveTextContent(
      CODEBOOK.notMappedDiamond,
    );

    await choose(harness, OPTION.codebook);

    await waitFor(() =>
      expect(shapeOf(harness)).toEqual({ default: 'diamond' }),
    );
    expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
      CODEBOOK.notMappedDiamond,
    );
  });

  it('writes only the codebook: the stage saves as it would have', async () => {
    const harness = await openFixture();
    const before = await harness.submit();

    await choose(harness, OPTION.sex);
    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));

    const after = await harness.submit();
    expect(after?.stageDocument).toEqual(before?.stageDocument);
  });

  it('offers gender identity only while the stage asks about it', async () => {
    const harness = await openFixture();
    expect(await option(OPTION.gender)).toBeVisible();

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Ask about gender identity' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Stop asking' }),
    );

    await waitFor(async () =>
      expect(
        (await symbols()).queryByRole('option', { name: OPTION.gender }),
      ).toBeNull(),
    );
    expect(await option(OPTION.sex)).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  describe('chooses the answer the codebook amounts to', () => {
    it('no attribute: set in the codebook, saying everyone has one symbol', async () => {
      await openFixture();
      expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
        CODEBOOK.notMappedCircle,
      );
    });

    it('sex assigned at birth, drawn the standard way', async () => {
      const harness = await openFixture();
      receiveShape(harness, SEX_SYMBOLS);
      await expectChosen(OPTION.sex);
    });

    it('gender identity, drawn the standard way, with no note', async () => {
      const harness = await openFixture();
      receiveShape(harness, GENDER_SYMBOLS);
      await expectChosen(OPTION.gender);
      expect(screen.queryByText(OUT_OF_DATE)).toBeNull();
    });

    it('one of those attributes drawn some other way: set in the codebook, saying so', async () => {
      const harness = await openFixture();
      receiveShape(harness, {
        default: 'diamond',
        dynamic: {
          ...SEX_SYMBOLS.dynamic,
          map: [
            { value: 'female', shape: 'square' },
            { value: 'male', shape: 'circle' },
          ],
        },
      });
      await waitFor(async () =>
        expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
          CODEBOOK.customSex,
        ),
      );
    });

    it('another attribute: set in the codebook, naming it', async () => {
      const harness = await openFixture();
      receiveShape(harness, {
        default: 'circle',
        dynamic: {
          variable: 'is_ego',
          type: 'discrete',
          map: [{ value: true, shape: 'square' }],
        },
      });
      await waitFor(async () =>
        expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
          CODEBOOK.other,
        ),
      );
    });
  });

  it('keeps gender identity chosen when its words change, and updates it from the note', async () => {
    const harness = await openFixture();
    receiveShape(harness, GENDER_SYMBOLS);
    await expectChosen(OPTION.gender);

    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit options' }),
    );
    const dialog = within(
      await screen.findByRole('dialog', {
        name: 'Edit gender identity options',
      }),
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Option 1 kinship words' }),
      'neutral',
    );
    await harness.user.click(
      dialog.getByRole('button', { name: 'Save attribute' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(await screen.findByText(OUT_OF_DATE)).toBeVisible();
    await expectChosen(OPTION.gender);
    // Choosing the answer already chosen rewrites nothing.
    await choose(harness, OPTION.gender);
    expect(shapeOf(harness)).toEqual(GENDER_SYMBOLS);

    await harness.user.click(
      screen.getByRole('button', { name: 'Update symbols' }),
    );

    // Updated without asking: these are symbols the choice set itself.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(shapeOf(harness)).toEqual({
        default: 'diamond',
        dynamic: {
          ...GENDER_SYMBOLS.dynamic,
          map: [
            { value: 'woman', shape: 'diamond' },
            ...GENDER_SYMBOLS.dynamic.map.slice(1),
          ],
        },
      }),
    );
    await waitFor(() => expect(screen.queryByText(OUT_OF_DATE)).toBeNull());
    await expectChosen(OPTION.gender);
  });

  it('asks before replacing symbols set by hand in the codebook', async () => {
    const harness = await openFixture();
    const handMade = {
      default: 'circle',
      dynamic: {
        variable: 'sexAssignedAtBirth',
        type: 'discrete',
        map: [{ value: 'intersex', shape: 'square' }],
      },
    };
    receiveShape(harness, handMade);
    await waitFor(async () =>
      expect(await expectChosen(OPTION.codebook)).toHaveTextContent(
        CODEBOOK.customSex,
      ),
    );

    await choose(harness, OPTION.sex);
    const confirmation = await screen.findByRole('dialog', {
      name: 'Replace the symbols set in the codebook?',
    });
    await harness.user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shapeOf(harness)).toEqual(handMade);
    await expectChosen(OPTION.codebook);

    await choose(harness, OPTION.sex);
    await harness.user.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Replace the symbols set in the codebook?',
        }),
      ).getByRole('button', { name: 'Replace symbols' }),
    );

    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));
  });

  it('is disabled for a spectator', async () => {
    await openFixture({ readOnly: true });
    await expectChosen(OPTION.codebook);
    expect(
      await screen.findByRole('listbox', { name: 'Symbols' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});
