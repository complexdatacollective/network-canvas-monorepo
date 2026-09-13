import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { fixtureMessage } from '../../testing/i18n.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';
import { useOnResearcherChange } from '../researcherChange.ts';

/**
 * A roster stage whose card details were configured against a data file the
 * stage no longer names.
 *
 * The prerequisite starts ABSENT, which is the case this file is about: the
 * researcher's first choice of file is a change like any other, and the
 * details describing the file that is gone are exactly what it invalidates.
 */
const rosterFields: SectionDoc = {
  label: 'People you know',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'prompt-1', text: 'Pick someone you know' }],
  cardOptions: {
    additionalProperties: [{ label: 'Nickname', variable: 'nickname' }],
  },
};

const rosterStage = {
  id: 'stage-1',
  type: 'NameGeneratorRoster' as const,
  fields: rosterFields,
};

/**
 * A control that writes its whole value in one go, the way a file picker does.
 *
 * A text input would be no use here: typing a name is a transition per
 * keystroke, so the first one being swallowed would be hidden by the second.
 * What a researcher does to a data file is choose one, once.
 */
function RosterFilePicker({
  id,
  value,
  onChange,
  picks,
}: Readonly<{
  id?: string;
  value?: FieldValue;
  onChange: (value: FieldValue) => void;
  picks: string;
}>) {
  return (
    <button
      type="button"
      id={id}
      onClick={() => {
        onChange(picks);
      }}
    >
      {typeof value === 'string' && value !== ''
        ? 'Choose a different roster file'
        : 'Choose a roster file'}
    </button>
  );
}

/**
 * The control's own name is its field's label: a `button` is labelable, so the
 * label `BaseField` renders for it wins over its content.
 */
const pickTheRosterFile = async (
  user: ReturnType<typeof renderStageEditor>['user'],
) => {
  await user.click(screen.getByRole('button', { name: 'Roster file' }));
};

const rosterFileSection = (
  <BuilderSection title="Roster file">
    <Field<typeof RosterFilePicker>
      name="dataSource"
      label="Roster file"
      component={RosterFilePicker}
      picks="roster-file-1"
    />
  </BuilderSection>
);

const cardOptionsCapability: SectionCapability = {
  fields: ['cardOptions'],
  confirmClear: {
    title: fixtureMessage('This will clear the card details'),
    description: fixtureMessage('The columns you chose will be removed.'),
    confirmLabel: fixtureMessage('Clear card details'),
  },
};

/** Records what a section watching `dataSource` is told, and nothing else. */
function ChangeProbe({
  onResearcherChange,
}: Readonly<{ onResearcherChange: (value: unknown) => void }>) {
  useOnResearcherChange('dataSource', onResearcherChange);
  return null;
}

/**
 * What the researcher did, told apart from the stage merely arriving that way.
 *
 * Only the FIRST OBSERVATION is not a change: nothing was configured against a
 * path this section has never seen hold anything, so a stage that opens
 * carrying its data file has nothing to reset. Everything after it is a
 * transition, and a transition out of `undefined` is the commonest one there
 * is — a path that starts absent is exactly the path a researcher is about to
 * fill in for the first time.
 */
describe('a value the researcher changed', () => {
  it('hears the first selection at a path that started absent', async () => {
    const onResearcherChange = vi.fn();
    const harness = renderStageEditor({
      stage: rosterStage,
      sections: (
        <>
          {rosterFileSection}
          <ChangeProbe onResearcherChange={onResearcherChange} />
        </>
      ),
    });

    // Nothing has been chosen yet, and the section has not been told anything.
    expect(onResearcherChange).not.toHaveBeenCalled();

    await pickTheRosterFile(harness.user);

    await waitFor(() => {
      expect(onResearcherChange).toHaveBeenCalledWith('roster-file-1');
    });
    expect(onResearcherChange).toHaveBeenCalledTimes(1);
  });
});

/**
 * And what hearing it one transition late would cost: the values describing
 * the file that was never there survive into the stage, under a file that has
 * different columns.
 */
describe('a capability whose prerequisite starts absent', () => {
  it('clears the stale values when the researcher chooses the prerequisite', async () => {
    const harness = renderStageEditor({
      stage: rosterStage,
      sections: (
        <>
          {rosterFileSection}
          <BuilderSection
            title="Card display"
            capability={cardOptionsCapability}
            resetOn="dataSource"
          >
            <p>Which columns of the roster the cards show.</p>
          </BuilderSection>
        </>
      ),
    });

    // The stage opens configured, which is what puts the section on.
    expect(
      await screen.findByRole('switch', { name: 'Card display' }),
    ).toBeChecked();

    await pickTheRosterFile(harness.user);

    // The columns named columns of a file the stage did not have. A different
    // file has different columns, so they describe nothing now — and the
    // section says so rather than standing open over a capability that holds
    // nothing.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Card display' }),
      ).not.toBeChecked();
    });
  });
});
