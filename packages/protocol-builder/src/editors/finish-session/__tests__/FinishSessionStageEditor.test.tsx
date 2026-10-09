import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { mountedAs } from '../../__tests__/formEditorHarness.tsx';
import { finishSessionStageEditor } from '../FinishSessionStageEditor.ts';

/** See `editors/__tests__/formEditorHarness.tsx` for why the stand-in. */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

/** The all-interfaces fixture is written in this one language. */
const FIXTURE_LANGUAGE = 'en-US';

const openStage = (fields: SectionDoc = {}) => ({
  stage: {
    type: 'FinishSession' as const,
    fields: {
      label: { [FIXTURE_LANGUAGE]: 'Finish' },
      title: { [FIXTURE_LANGUAGE]: 'All *done*' },
      content: { [FIXTURE_LANGUAGE]: 'Thank you for taking part.' },
      finishLabel: { [FIXTURE_LANGUAGE]: 'Finish' },
      finishConfirmation: { [FIXTURE_LANGUAGE]: 'Finish this interview?' },
      finishedNotice: { [FIXTURE_LANGUAGE]: 'This interview is finished.' },
      finishFailed: {
        [FIXTURE_LANGUAGE]: 'The interview could not be finished.',
      },
      outcome: 'completed',
      ...fields,
    },
  },
  editor: mountedAs(finishSessionStageEditor.FinishSession),
});

describe('the editor for the screen that ends the interview', () => {
  it('edits the closing text, the outcome and the interviewer guidance, and offers no skip logic', () => {
    renderStageEditor(openStage());

    expect(
      screen.getByRole('heading', { name: 'Closing screen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Heading/ })).toHaveValue(
      'All *done*',
    );
    expect(screen.getByRole('textbox', { name: /^Text/ })).toHaveValue(
      'Thank you for taking part.',
    );
    expect(
      screen.getByRole('heading', { name: 'Interviewer guidance' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/skip logic/i)).not.toBeInTheDocument();
  });

  it('edits the words a participant sees while finishing', () => {
    renderStageEditor(openStage());

    expect(
      screen.getByRole('heading', { name: 'Finishing the interview' }),
    ).toBeInTheDocument();
    for (const [name, value] of [
      [/Finish button/, 'Finish'],
      [/Confirmation question/, 'Finish this interview?'],
      [/Finished notice/, 'This interview is finished.'],
      [/If finishing fails/, 'The interview could not be finished.'],
    ] as const) {
      expect(screen.getByRole('textbox', { name })).toHaveValue(value);
    }
  });

  it('saves the finishing words the researcher writes', async () => {
    const harness = renderStageEditor(openStage());
    const user = userEvent.setup();

    // Writable once the protocol's languages are known.
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: /Finish button/ }),
      ).not.toHaveAttribute('readonly'),
    );
    const button = screen.getByRole('textbox', { name: /Finish button/ });
    await user.clear(button);
    await user.type(button, 'Done');

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      finishLabel: { [FIXTURE_LANGUAGE]: 'Done' },
      finishConfirmation: { [FIXTURE_LANGUAGE]: 'Finish this interview?' },
    });
  });

  it('offers the three outcomes, each explained', () => {
    renderStageEditor(openStage());

    const outcomes = screen.getByRole('listbox', {
      name: /How the interview ended/,
    });
    expect(within(outcomes).getAllByRole('option')).toHaveLength(3);
    expect(
      within(outcomes).getByRole('option', { name: /Completed/ }),
    ).toHaveAttribute('aria-selected', 'true');
    for (const [name, explanation] of [
      ['Completed', 'The participant reached the normal end of the interview.'],
      ['Ineligible', 'The participant did not qualify for the study.'],
      [
        'Ended early',
        'The interview ended early for another reason, such as a distress or safety stop.',
      ],
    ] as const) {
      expect(within(outcomes).getByText(name)).toBeInTheDocument();
      expect(within(outcomes).getByText(explanation)).toBeInTheDocument();
    }
  });

  it('saves a stage it opened unchanged', async () => {
    const harness = renderStageEditor(
      openStage({ interviewScript: 'Thank the participant.' }),
    );

    await harness.roundTrip();
  });

  it('saves the outcome the researcher chooses', async () => {
    const harness = renderStageEditor(openStage());
    const user = userEvent.setup();

    await user.click(
      within(
        screen.getByRole('listbox', { name: /How the interview ended/ }),
      ).getByRole('option', { name: /Ineligible/ }),
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      type: 'FinishSession',
      outcome: 'ineligible',
    });
  });

  // Architect and Studio add a protocol's finish stage with the supplied
  // closing text; the editor's own template holds only the outcome.
  it('starts a new finish screen ending as completed', async () => {
    renderStageEditor({
      create: { type: 'FinishSession', position: 0 },
      editor: mountedAs(finishSessionStageEditor.FinishSession),
    });

    await waitFor(() =>
      expect(
        within(
          screen.getByRole('listbox', { name: /How the interview ended/ }),
        ).getByRole('option', { name: /Completed/ }),
      ).toHaveAttribute('aria-selected', 'true'),
    );
  });
});
