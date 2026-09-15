import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { writeInto } from '../../editors/__tests__/writeInto.ts';
import TieStrengthCensusPromptsSection from '../../editors/tie-strength-census/sections/TieStrengthCensusPromptsSection.tsx';
import {
  attributeField,
  chooseAttributeById,
} from '../../testing/attributePicker.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import FormFieldsSection from '../form-fields/FormFieldsSection.tsx';

/** A row editor's own queries, scoped to the dialog it opened. */
const openFormField = async (harness: StageEditorHarness) => {
  await harness.user.click(screen.getByRole('button', { name: 'Edit field' }));
  return within(await screen.findByRole('dialog'));
};

/**
 * The connection type whose scale the fixture's census prompt asks about, and
 * the section of the protocol that holds it.
 */
const CENSUS_EDGE = 'knows';
const CENSUS_EDGE_SECTION = sectionId({
  kind: 'codebookEdge',
  typeId: CENSUS_EDGE,
});
const SCALE_VARIABLE = 'closeness';

const openSection = () => ({
  stageId: 'tie-strength-census-1' as const,
  sections: <TieStrengthCensusPromptsSection />,
});

/**
 * How many times the connection type's section has been written.
 *
 * The only way to prove that a save wrote NOTHING to the codebook: a write of
 * the same list is still a revision a collaborator has to merge, and comparing
 * the documents cannot see it.
 */
const edgeRevision = (harness: StageEditorHarness): bigint =>
  harness.host.store.read(CENSUS_EDGE_SECTION).revision.sequence;

const censusEdgeDocument = (harness: StageEditorHarness): SectionDoc => {
  const section = harness.protocolSections()[CENSUS_EDGE_SECTION];
  if (section === undefined) {
    throw new Error(
      `the fixture protocol has no "${CENSUS_EDGE}" edge type, which is the one this census's prompt asks about.`,
    );
  }
  return section;
};

/** The scale as the codebook holds it now. */
const scale = (harness: StageEditorHarness): Record<string, unknown> => {
  const held =
    harness.hostCodebook().edge?.[CENSUS_EDGE]?.variables?.[SCALE_VARIABLE];
  if (held === undefined) {
    throw new Error(
      `the protocol no longer holds the "${SCALE_VARIABLE}" scale this test is about.`,
    );
  }
  return held as unknown as Record<string, unknown>;
};

/**
 * A change to the scale made by somebody else while the prompt is open.
 *
 * `patch` receives the attribute as the protocol holds it and answers with the
 * attribute as the collaborator leaves it, so a test says only what that other
 * researcher did.
 */
function collaboratorEdits(
  harness: StageEditorHarness,
  patch: (held: Record<string, unknown>) => Record<string, unknown>,
): void {
  const document = censusEdgeDocument(harness);
  const variables =
    typeof document.variables === 'object' && document.variables !== null
      ? (document.variables as Record<string, unknown>)
      : {};
  const held = variables[SCALE_VARIABLE];
  harness.receiveCodebookUpdate({
    edge: {
      [CENSUS_EDGE]: {
        ...document,
        variables: {
          ...variables,
          [SCALE_VARIABLE]: patch(
            (typeof held === 'object' && held !== null ? held : {}) as Record<
              string,
              unknown
            >,
          ),
        },
      },
    },
  });
}

/** The scale's points with one more on the end, as a collaborator adds one. */
const withAnExtraPoint = (
  held: Record<string, unknown>,
): Record<string, unknown> => ({
  ...held,
  options: [
    ...(Array.isArray(held.options) ? held.options : []),
    { label: 'Inseparable', value: 4 },
  ],
});

/**
 * The list an attribute offers belongs to the codebook, and the prompt that
 * shows it inline is one of several places it can be edited from. So a save
 * made from here has to be able to say what the RESEARCHER wrote, rather than
 * writing back whatever the control was seeded with.
 */
describe('the answers a prompt writes back to its attribute', () => {
  it('writes nothing at all when the researcher left the answers alone', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();
    const before = edgeRevision(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    // The list is on screen and seeded from the codebook, which is the whole
    // difficulty: the row is holding it whether or not anybody touched it.
    await screen.findByRole('region', { name: 'Choice values' });
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are these two?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // A revision on the connection type's section is a change a collaborator
    // has to merge. A prompt's wording is not one.
    expect(edgeRevision(harness)).toBe(before);
  });

  it('leaves a point a collaborator added while the prompt was open', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('region', { name: 'Choice values' });

    collaboratorEdits(harness, withAnExtraPoint);
    await waitFor(() => expect(scale(harness).options).toHaveLength(4));

    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are these two?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The save was about the prompt's wording. The other researcher's fourth
    // point is still there.
    expect(scale(harness).options).toEqual([
      { label: 'Very close', value: 3 },
      { label: 'Somewhat close', value: 2 },
      { label: 'Not close', value: 1 },
      { label: 'Inseparable', value: 4 },
    ]);
  });

  /**
   * Both researchers edited the attribute, and this save owns the list.
   *
   * The same ownership every codebook surface in this package writes under: an
   * editor writes the properties it set and the host keeps the rest. So the
   * collaborator's RENAME survives — this prompt offered no control for it —
   * and their edit to the list itself does not, because the list is the one
   * thing this save is about.
   */
  it('writes the researcher’s own list whole, keeping what the save did not touch', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const values = within(
      await screen.findByRole('region', { name: 'Choice values' }),
    );
    await harness.user.click(
      values.getByRole('button', { name: 'Edit option 1' }),
    );
    const label = await screen.findByRole('textbox', { name: 'Label' });
    await harness.user.clear(label);
    await harness.user.type(label, 'Inseparable');
    await harness.user.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    collaboratorEdits(harness, (held) => ({
      ...withAnExtraPoint(held),
      name: 'tieStrength',
    }));
    await waitFor(() => expect(scale(harness).name).toBe('tieStrength'));

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(scale(harness).options).toEqual([
        { label: 'Inseparable', value: 3 },
        { label: 'Somewhat close', value: 2 },
        { label: 'Not close', value: 1 },
      ]),
    );
    expect(scale(harness).name).toBe('tieStrength');
  });
});

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });
const CHOICE_VARIABLE = 'contactType';

/** A form collecting one attribute whose answers are a list. */
const FORM_COLLECTING_A_CHOICE = {
  id: 'alter-form-1',
  type: 'AlterForm',
  fields: {
    ...loadFixtureStage('alter-form-1').fields,
    form: {
      fields: [
        { variable: CHOICE_VARIABLE, prompt: 'How do you keep in touch?' },
      ],
    },
  },
} as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const collectedAttribute = (
  harness: StageEditorHarness,
): Record<string, unknown> =>
  asRecord(
    asRecord(asRecord(harness.hostCodebook().node?.person).variables)[
      CHOICE_VARIABLE
    ],
  );

/**
 * Writes the collected attribute as somebody outside this editor leaves it.
 *
 * Used for two different jobs, and they are the same write: giving the
 * attribute the control the fixture never named — so that the row's own
 * control write has nothing to say and only the ANSWERS are left to account
 * for — and standing in for the collaborator who edits it mid-dialog.
 */
function writeTheAttribute(
  harness: StageEditorHarness,
  patch: (held: Record<string, unknown>) => Record<string, unknown>,
): void {
  const person = harness.protocolSections()[PERSON_SECTION];
  if (person === undefined) {
    throw new Error('the fixture protocol has no "person" node type.');
  }
  const variables = asRecord(person.variables);
  harness.receiveCodebookUpdate({
    node: {
      person: {
        ...person,
        variables: {
          ...variables,
          [CHOICE_VARIABLE]: patch(asRecord(variables[CHOICE_VARIABLE])),
        },
      },
    },
  });
}

/** The control the row would otherwise have to write, already recorded. */
const withTheControlTheRowWouldChoose = (
  held: Record<string, unknown>,
): Record<string, unknown> => ({ ...held, component: 'CheckboxGroup' });

const withAnExtraAnswer = (
  held: Record<string, unknown>,
): Record<string, unknown> => ({
  ...held,
  options: [
    ...(Array.isArray(held.options) ? held.options : []),
    { label: 'Letters', value: 'letters' },
  ],
});

/**
 * A form field authors the same list under the same rule, from a commit of its
 * own: its row carries the attribute's control as well as its answers, so it
 * cannot share the prompt families' gate — but a save about the question's
 * WORDING must not write the answers back either.
 */
describe('the answers a form field writes back to its attribute', () => {
  it('writes nothing to the attribute when only the question changed', async () => {
    const harness = renderStageEditor({
      stage: FORM_COLLECTING_A_CHOICE,
      sections: <FormFieldsSection subject="node" />,
    });
    await harness.opened();
    writeTheAttribute(harness, withTheControlTheRowWouldChoose);
    await waitFor(() =>
      expect(collectedAttribute(harness).component).toBe('CheckboxGroup'),
    );
    const before = harness.host.store.read(PERSON_SECTION).revision.sequence;

    const dialog = await openFormField(harness);
    await dialog.findByRole('region', { name: 'Choice values' });
    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How do you usually keep in touch?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // A revision on the person type's section is a change a collaborator has
    // to merge. Rewording the question a form asks is not one.
    expect(harness.host.store.read(PERSON_SECTION).revision.sequence).toBe(
      before,
    );
  });

  it('leaves an answer a collaborator added while the field was open', async () => {
    const harness = renderStageEditor({
      stage: FORM_COLLECTING_A_CHOICE,
      sections: <FormFieldsSection subject="node" />,
    });
    await harness.opened();
    writeTheAttribute(harness, withTheControlTheRowWouldChoose);
    await waitFor(() =>
      expect(collectedAttribute(harness).component).toBe('CheckboxGroup'),
    );

    const dialog = await openFormField(harness);
    await dialog.findByRole('region', { name: 'Choice values' });

    writeTheAttribute(harness, (held) =>
      withAnExtraAnswer(withTheControlTheRowWouldChoose(held)),
    );
    await waitFor(() =>
      expect(collectedAttribute(harness).options).toHaveLength(4),
    );

    await writeInto(
      harness,
      dialog.getByRole('textbox', { name: 'Question text' }),
      'How do you usually keep in touch?',
    );
    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(collectedAttribute(harness).options).toEqual([
      { label: 'In person', value: 'in_person' },
      { label: 'Phone or video call', value: 'call' },
      { label: 'Text or messaging', value: 'text' },
      { label: 'Letters', value: 'letters' },
    ]);
  });
});

/**
 * The answers on screen belong to the attribute the row binds NOW.
 *
 * The control is keyed on the attribute, but every one of them registers under
 * the same draft key and fresco-ui parks a value when a field unregisters, so
 * a re-mount takes the parked list in preference to its own seed. Nothing put
 * the new attribute's list there — so the row went on holding the FIRST
 * attribute's answers and its save wrote them onto the second.
 */
describe('the answers shown after the row is pointed somewhere else', () => {
  /** A second attribute of the same kind, for the row to be moved onto. */
  const MOOD = {
    name: 'mood',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      { label: 'Happy', value: 'happy' },
      { label: 'Sad', value: 'sad' },
      { label: 'Neither', value: 'neither' },
    ],
  };

  const openOnAChoice = async (harness: StageEditorHarness) => {
    await harness.opened();
    const person = harness.protocolSections()[PERSON_SECTION];
    if (person === undefined) {
      throw new Error('the fixture protocol has no "person" node type.');
    }
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...asRecord(person.variables),
            [CHOICE_VARIABLE]: withTheControlTheRowWouldChoose(
              asRecord(asRecord(person.variables)[CHOICE_VARIABLE]),
            ),
            mood: MOOD,
          },
        },
      },
    });
    await waitFor(() =>
      expect(collectedAttribute(harness).component).toBe('CheckboxGroup'),
    );
    const dialog = await openFormField(harness);
    await dialog.findByRole('region', { name: 'Choice values' });
    return dialog;
  };

  const pointTheRowAt = async (
    harness: StageEditorHarness,
    attributeId: string,
  ) => {
    await chooseAttributeById(
      harness.user,
      attributeField('Attribute', screen.getByRole('dialog')),
      attributeId,
    );
  };

  const personVariable = (
    harness: StageEditorHarness,
    id: string,
  ): Record<string, unknown> =>
    asRecord(
      asRecord(asRecord(harness.hostCodebook().node?.person).variables)[id],
    );

  it('leaves the second attribute’s own answers alone', async () => {
    const harness = renderStageEditor({
      stage: FORM_COLLECTING_A_CHOICE,
      sections: <FormFieldsSection subject="node" />,
    });
    const dialog = await openOnAChoice(harness);

    await pointTheRowAt(harness, 'mood');

    // The list on screen is the attribute the row binds now, not the one it
    // opened on.
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Choice values' })).getByText(
          'Happy',
        ),
      ).toBeVisible(),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    expect(personVariable(harness, 'mood').options).toEqual(MOOD.options);
  });

  /**
   * And a list of one SHAPE is never carried onto an attribute of the other.
   *
   * A yes-or-no attribute's answers are two, keyed by the boolean each records.
   * A choice list passes straight through the shape reading, so three choice
   * options were written onto a boolean — a record the protocol schema refuses
   * and the interview cannot draw.
   */
  it('never carries a choice list onto a yes-or-no attribute', async () => {
    const harness = renderStageEditor({
      stage: FORM_COLLECTING_A_CHOICE,
      sections: <FormFieldsSection subject="node" />,
    });
    const dialog = await openOnAChoice(harness);

    await pointTheRowAt(harness, 'flagged');
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Choice values' }),
      ).toBeNull(),
    );

    await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryAllByRole('dialog')).toHaveLength(0),
    );

    // Whatever the yes-or-no attribute ends up holding, it is not the three
    // choices the row was showing a moment ago.
    const held = personVariable(harness, 'flagged').options;
    expect(Array.isArray(held) ? held : []).not.toEqual(
      expect.arrayContaining([{ label: 'In person', value: 'in_person' }]),
    );
    expect(Array.isArray(held) ? held.length : 0).toBeLessThanOrEqual(2);
  });
});
