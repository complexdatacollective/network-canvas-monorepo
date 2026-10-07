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

const STATUS = {
  notMappedCircle: 'Everyone is drawn as a circle.',
  notMappedDiamond: 'Everyone is drawn as a diamond.',
  sex: 'Symbols follow sex assigned at birth: a circle for female, a square for male, and a diamond for everyone else.',
  gender:
    'Symbols follow gender identity: a circle for options with feminine words, a square for options with masculine words, and a diamond for everyone else.',
  genderOutOfDate:
    'Symbols follow gender identity, but its options or their kinship words have changed since the symbols were set.',
  customSex:
    'Symbols follow sex assigned at birth, with shapes set differently in the codebook.',
  other: 'Symbols follow the attribute is_ego, set in the codebook.',
} as const;

const openFixture = async (): Promise<StageEditorHarness> => {
  const harness = renderStageEditor({
    stageId: 'family-pedigree-1',
    editor: familyPedigreeEditor,
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

const symbols = async () =>
  within(await screen.findByRole('group', { name: 'Symbols' }));

const expectStatus = async (text: string) => {
  const group = await symbols();
  await waitFor(() => expect(group.getByText(text)).toBeVisible());
};

const click = async (harness: StageEditorHarness, name: string) => {
  await harness.user.click((await symbols()).getByRole('button', { name }));
};

describe('the pedigree symbols control', () => {
  it('sets symbols from sex assigned at birth in one click, without asking', async () => {
    const harness = await openFixture();
    await expectStatus(STATUS.notMappedCircle);

    await click(harness, 'Use sex assigned at birth');

    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectStatus(STATUS.sex);
    // Already the standard symbols, so the button that sets them is gone.
    expect(
      (await symbols()).queryByRole('button', {
        name: 'Use sex assigned at birth',
      }),
    ).toBeNull();
  });

  it('sets symbols from gender identity and its kinship words in one click', async () => {
    const harness = await openFixture();

    await click(harness, 'Use gender identity');

    await waitFor(() => expect(shapeOf(harness)).toEqual(GENDER_SYMBOLS));
    await expectStatus(STATUS.gender);
  });

  it('draws everyone with one symbol again when asked', async () => {
    const harness = await openFixture();
    receiveShape(harness, SEX_SYMBOLS);
    await expectStatus(STATUS.sex);

    await click(harness, 'Use one symbol for everyone');

    await waitFor(() =>
      expect(shapeOf(harness)).toEqual({ default: 'diamond' }),
    );
    await expectStatus(STATUS.notMappedDiamond);
  });

  it('writes only the codebook: the stage saves as it would have', async () => {
    const harness = await openFixture();
    const before = await harness.submit();

    await click(harness, 'Use sex assigned at birth');
    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));

    const after = await harness.submit();
    expect(after?.stageDocument).toEqual(before?.stageDocument);
  });

  it('offers gender identity only while the stage asks about it', async () => {
    const harness = await openFixture();
    expect(
      (await symbols()).getByRole('button', { name: 'Use gender identity' }),
    ).toBeVisible();

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Ask about gender identity' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Stop asking' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Use gender identity' }),
      ).toBeNull(),
    );
    expect(
      (await symbols()).getByRole('button', {
        name: 'Use sex assigned at birth',
      }),
    ).toBeVisible();
  });

  describe('says what the symbols follow, read from the codebook', () => {
    it('no attribute', async () => {
      await openFixture();
      await expectStatus(STATUS.notMappedCircle);
    });

    it('sex assigned at birth, drawn the standard way', async () => {
      const harness = await openFixture();
      receiveShape(harness, SEX_SYMBOLS);
      await expectStatus(STATUS.sex);
    });

    it('gender identity, drawn the standard way', async () => {
      const harness = await openFixture();
      receiveShape(harness, GENDER_SYMBOLS);
      await expectStatus(STATUS.gender);
      expect(
        (await symbols()).queryByRole('button', { name: 'Update symbols' }),
      ).toBeNull();
    });

    it('one of those attributes, drawn some other way', async () => {
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
      await expectStatus(STATUS.customSex);
    });

    it('another attribute', async () => {
      const harness = await openFixture();
      receiveShape(harness, {
        default: 'circle',
        dynamic: {
          variable: 'is_ego',
          type: 'discrete',
          map: [{ value: true, shape: 'square' }],
        },
      });
      await expectStatus(STATUS.other);
    });
  });

  it('offers to update gender identity symbols whose words have changed since', async () => {
    const harness = await openFixture();
    receiveShape(harness, GENDER_SYMBOLS);
    await expectStatus(STATUS.gender);

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

    await expectStatus(STATUS.genderOutOfDate);
    await click(harness, 'Update symbols');

    // Updated without asking: these are symbols the control set itself.
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
    await expectStatus(STATUS.gender);
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
    await expectStatus(STATUS.customSex);

    await click(harness, 'Use sex assigned at birth');
    const confirmation = await screen.findByRole('dialog', {
      name: 'Replace the symbols set in the codebook?',
    });
    await harness.user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(shapeOf(harness)).toEqual(handMade);

    await click(harness, 'Use sex assigned at birth');
    await harness.user.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Replace the symbols set in the codebook?',
        }),
      ).getByRole('button', { name: 'Replace symbols' }),
    );

    await waitFor(() => expect(shapeOf(harness)).toEqual(SEX_SYMBOLS));
  });

  it('offers no buttons to a spectator', async () => {
    const harness = renderStageEditor({
      stageId: 'family-pedigree-1',
      editor: familyPedigreeEditor,
      readOnly: true,
    });
    await harness.opened();
    await expectStatus(STATUS.notMappedCircle);
    expect((await symbols()).queryAllByRole('button')).toEqual([]);
  });
});
