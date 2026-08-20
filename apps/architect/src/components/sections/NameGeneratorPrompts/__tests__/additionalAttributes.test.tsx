import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { Stage, StageType } from '@codaco/protocol-validation';
import StageFormBridge from '~/components/StageEditor/StageFormBridge';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The spotlight picker is a whole search UI; these tests only need a control
// that can report a variable was chosen. What it emits is deliberately NOT
// bound to the options it was handed: a pool that has gone stale since the
// dialog opened is exactly the case the save-time gate backstops.
const picker = vi.hoisted(() => ({ emits: 'close' }));

vi.mock('~/components/Form/Fields/VariablePicker/VariablePicker', () => ({
  VariablePickerControl: ({
    onChange,
  }: {
    onChange?: (value: string) => void;
  }) => (
    <button type="button" onClick={() => onChange?.(picker.emits)}>
      Select attribute
    </button>
  ),
  default: () => null,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import NameGeneratorRosterPrompts from '~/components/sections/NameGeneratorRosterPrompts/NameGeneratorRosterPrompts';
// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { validatedElsewhereMessage } from '~/components/Validations/contradictions';

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import NameGeneratorPrompts from '../NameGeneratorPrompts';

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'c',
      variables: {
        close: { name: 'Close', type: 'boolean' },
        nearby: { name: 'Nearby', type: 'boolean' },
        other: { name: 'Other', type: 'boolean' },
      },
    },
  },
};

/**
 * A form on ANOTHER stage collecting `nearby` — a VALIDATED use, which the
 * additionalAttributes stamp (an UNVALIDATED writer) may not contradict. It
 * sits at stage index 1 because the prompt editor under test is stage 0, whose
 * own saved roles are deliberately excluded as stale.
 */
const NEARBY_COLLECTED_ELSEWHERE = {
  id: 's2',
  type: 'AlterForm',
  label: 'F',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'nearby', prompt: 'P' }] },
};

const asStage = (values: Record<string, unknown>) => values as unknown as Stage;

const INCOMPLETE_MESSAGE =
  'Every additional attribute needs both an attribute and a value.';

const NEARBY_ELSEWHERE_MESSAGE = validatedElsewhereMessage('Nearby');

type AttributeRow = { variable?: string | null; value?: boolean | null };

const openPromptEditor = ({
  additionalAttributes,
  otherStages = [],
  section: Section = NameGeneratorPrompts,
  interfaceType = 'NameGenerator',
  stageValues = {},
}: {
  additionalAttributes?: AttributeRow[];
  otherStages?: Record<string, unknown>[];
  section?: typeof NameGeneratorPrompts;
  interfaceType?: StageType;
  stageValues?: Record<string, unknown>;
} = {}) => {
  const prompt = {
    id: 'p1',
    text: 'Who do you know?',
    ...(additionalAttributes ? { additionalAttributes } : {}),
  };
  const stages = [
    {
      id: 's1',
      type: interfaceType,
      label: 'N',
      subject: { entity: 'node', type: 'person' },
      prompts: [prompt],
      ...stageValues,
    },
    ...otherStages,
  ];

  const store = configureStore({
    reducer: {
      activeProtocol: (state = { present: { codebook: CODEBOOK, stages } }) =>
        state,
      stageEditorDraft,
    },
  });

  render(
    <Provider store={store}>
      <FormStoreProvider>
        <StageFormBridge
          committedStage={asStage({
            subject: { entity: 'node', type: 'person' },
            prompts: [prompt],
            ...stageValues,
          })}
          stageId="stage-1"
          formId="edit-stage"
        >
          <Section
            stagePath="stages[0]"
            stagePosition={0}
            interfaceType={interfaceType}
          />
        </StageFormBridge>
      </FormStoreProvider>
    </Provider>,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Edit prompt' }));
};

const saveButton = () => screen.getByRole('button', { name: 'Save' });
const save = () => fireEvent.click(saveButton());

const expectSaved = async () => {
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
  );
};

beforeEach(() => {
  picker.emits = 'close';
});

/**
 * A half-finished "Assign Additional Variables" row is rejected by the protocol
 * schema, but the row's own `required` rules are display-only (see `RowField`),
 * so only an array-level rule on the owning field can refuse the save. Without
 * it the dialog closed happily and the damage surfaced far from the cause: a
 * permanently disabled Preview button, and an export that failed validation on
 * import.
 */
describe('Name Generator prompt: assigned additional variables', () => {
  it('refuses to save a row with no variable chosen', async () => {
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    save();

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    // Still in the editor, with the offending row pointed at rather than just
    // an array-level complaint.
    expect(saveButton()).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('refuses to save a row whose value was never chosen', async () => {
    openPromptEditor();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select attribute' }));
    await screen.findByLabelText('Value to assign');
    save();

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
  });

  it('saves a prompt that assigns nothing', async () => {
    openPromptEditor();

    await screen.findByRole('button', { name: 'Add new attribute to assign' });
    save();

    await expectSaved();
    expect(screen.queryByText(INCOMPLETE_MESSAGE)).toBeNull();
  });

  it('saves a prompt that assigns nothing even while a conflict exists elsewhere', async () => {
    openPromptEditor({ otherStages: [NEARBY_COLLECTED_ELSEWHERE] });

    await screen.findByRole('button', { name: 'Add new attribute to assign' });
    save();

    await expectSaved();
  });

  it('saves a row that stamps False', async () => {
    // `false` is an answer, not an absent value — neither array-level rule may
    // read it for truthiness.
    openPromptEditor({
      additionalAttributes: [{ variable: 'close', value: false }],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });

    await screen.findByLabelText('Value to assign');
    save();

    await expectSaved();
  });
});

/**
 * The prompt dialog's save-time cross-class gate. The row renders an explicit
 * "collected by a form elsewhere … cannot be written by this stage" error, but
 * a `RowField` error only DISPLAYS — so without an array-level counterpart the
 * researcher read that error, clicked Save, and the contradiction went into the
 * protocol regardless. The interview then stamps unvalidated booleans onto a
 * form-validated variable, leaving only a dismissable timeline warning.
 *
 * `NameGeneratorRosterPrompts` renders this same `PromptFields`, so it is
 * covered by these too (see its own case at the bottom of the file).
 */
describe('Name Generator prompt: cross-class gate', () => {
  it('refuses the save the row is already showing an error for', async () => {
    openPromptEditor({
      additionalAttributes: [{ variable: 'close', value: true }],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });
    picker.emits = 'nearby';

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select attribute' }),
    );

    // The row says so first…
    expect(
      await screen.findByText(NEARBY_ELSEWHERE_MESSAGE),
    ).toBeInTheDocument();

    save();

    // …and the save is now refused with the same sentence, because both
    // layers run the same function.
    await waitFor(() =>
      expect(screen.getAllByText(NEARBY_ELSEWHERE_MESSAGE).length).toBe(2),
    );
    expect(saveButton()).toBeInTheDocument();
  });

  /**
   * The escape. A contradiction this prompt already carries (an imported
   * protocol, a stale draft) must never block an edit that did not introduce
   * it — including one that only deleted a sibling row, which renumbers every
   * survivor while the committed value stays frozen at its saved positions.
   */
  it('saves a committed pick after a sibling row is deleted', async () => {
    openPromptEditor({
      additionalAttributes: [
        { variable: 'close', value: true },
        { variable: 'nearby', value: true },
      ],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });

    const deleteButtons = await screen.findAllByRole('button', {
      name: 'Delete attribute',
    });
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Delete attribute' }),
      ).toHaveLength(1),
    );
    save();

    await expectSaved();
  });

  it('does not accuse a survivor of the deleted row’s pick', async () => {
    // The survivor's OWN saved pick is `nearby`; the deleted row's was
    // `close`. Reading the committed value by the survivor's new position
    // asked the wrong row's question and produced this accusation against a
    // selection the researcher never touched.
    openPromptEditor({
      additionalAttributes: [
        { variable: 'close', value: true },
        { variable: 'nearby', value: true },
      ],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });

    const deleteButtons = await screen.findAllByRole('button', {
      name: 'Delete attribute',
    });
    fireEvent.click(deleteButtons[0]!);
    // A half-finished sibling reveals every row's errors without waiting for
    // an edit, which is how the accusation reached the researcher.
    fireEvent.click(
      screen.getByRole('button', { name: 'Add new attribute to assign' }),
    );
    save();

    expect(await screen.findByText(INCOMPLETE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(NEARBY_ELSEWHERE_MESSAGE)).toBeNull();
  });

  it('refuses a pick this prompt never saved, even once a deletion has renumbered the rows', async () => {
    openPromptEditor({
      additionalAttributes: [
        { variable: 'close', value: true },
        { variable: 'other', value: true },
      ],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });
    picker.emits = 'nearby';

    const deleteButtons = await screen.findAllByRole('button', {
      name: 'Delete attribute',
    });
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Select attribute' }),
      ).toHaveLength(1),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select attribute' }));
    save();

    expect(
      await screen.findAllByText(NEARBY_ELSEWHERE_MESSAGE),
    ).not.toHaveLength(0);
    expect(saveButton()).toBeInTheDocument();
  });
});

/**
 * `NameGeneratorRosterPrompts` renders the same `PromptFields`, so the gate
 * reaches it without a second wiring — but it supplies NO `currentStageIndex`,
 * so its role map counts every stage rather than treating its own saved roles
 * as stale. Verified rather than assumed.
 */
describe('Name Generator Roster prompt: cross-class gate', () => {
  const openRosterPromptEditor = (
    options: Parameters<typeof openPromptEditor>[0] = {},
  ) =>
    openPromptEditor({
      ...options,
      section: NameGeneratorRosterPrompts,
      interfaceType: 'NameGeneratorRoster',
      // The section is disabled until a data source is chosen.
      stageValues: { dataSource: 'roster-asset' },
    });

  it('refuses the save the row is already showing an error for', async () => {
    openRosterPromptEditor({
      additionalAttributes: [{ variable: 'close', value: true }],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });
    picker.emits = 'nearby';

    fireEvent.click(
      await screen.findByRole('button', { name: 'Select attribute' }),
    );
    expect(
      await screen.findByText(NEARBY_ELSEWHERE_MESSAGE),
    ).toBeInTheDocument();

    save();

    await waitFor(() =>
      expect(screen.getAllByText(NEARBY_ELSEWHERE_MESSAGE).length).toBe(2),
    );
    expect(saveButton()).toBeInTheDocument();
  });

  it('saves a committed pick after a sibling row is deleted', async () => {
    openRosterPromptEditor({
      additionalAttributes: [
        { variable: 'close', value: true },
        { variable: 'nearby', value: true },
      ],
      otherStages: [NEARBY_COLLECTED_ELSEWHERE],
    });

    const deleteButtons = await screen.findAllByRole('button', {
      name: 'Delete attribute',
    });
    fireEvent.click(deleteButtons[0]!);
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Delete attribute' }),
      ).toHaveLength(1),
    );
    save();

    await expectSaved();
  });
});
