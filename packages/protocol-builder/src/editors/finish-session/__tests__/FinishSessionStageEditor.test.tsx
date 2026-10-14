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
      mode: 'confirmation',
      label: { [FIXTURE_LANGUAGE]: 'Finish' },
      content: {
        [FIXTURE_LANGUAGE]: '# All *done*\n\nThank you for taking part.',
      },
      finishedContent: {
        [FIXTURE_LANGUAGE]:
          '# Interview Finished\n\nThank you for participating!',
      },
      finishLabel: { [FIXTURE_LANGUAGE]: 'Finish' },
      finishConfirmation: { [FIXTURE_LANGUAGE]: 'Finish this interview?' },
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
  it('edits the closing and finished text, the outcome and the interviewer guidance, and offers no skip logic', () => {
    renderStageEditor(openStage());

    expect(
      screen.getByRole('heading', { name: 'Closing screen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Closing text/ })).toHaveValue(
      // The stand-in is a one-line input, which drops the line breaks.
      '# All *done*Thank you for taking part.',
    );
    expect(
      screen.getByRole('heading', { name: 'Finished screen' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Finished text/ })).toHaveValue(
      '# Interview FinishedThank you for participating!',
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

  it('asks participants to confirm unless the stage finishes automatically', () => {
    renderStageEditor(openStage());

    const modes = screen.getByRole('listbox', { name: /Finishing/ });
    expect(within(modes).getAllByRole('option')).toHaveLength(2);
    expect(
      within(modes).getByRole('option', { name: /Participants confirm/ }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('drops the closing screen and the confirmation question when finishing automatically', async () => {
    const harness = renderStageEditor(openStage());
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('listbox', { name: /Finishing/ })).getByRole(
        'option',
        { name: /Finish automatically/ },
      ),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Closing screen' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('textbox', { name: /Confirmation question/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Finished text/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Finish button/ }),
    ).toBeInTheDocument();

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      type: 'FinishSession',
      mode: 'automatic',
    });
  });

  it('keeps a blank confirmation question to fill in when finishing automatically', async () => {
    renderStageEditor(
      openStage({ finishConfirmation: { [FIXTURE_LANGUAGE]: '' } }),
    );
    const user = userEvent.setup();

    await user.click(
      within(screen.getByRole('listbox', { name: /Finishing/ })).getByRole(
        'option',
        { name: /Finish automatically/ },
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Closing screen' }),
      ).not.toBeInTheDocument(),
    );

    // The stage cannot be saved with it blank, so it stays to be filled in,
    // and does not vanish while it is being typed.
    const question = screen.getByRole('textbox', {
      name: /Confirmation question/,
    });
    await user.type(question, 'Finish now?');
    expect(question).toBeInTheDocument();
    expect(question).toHaveValue('Finish now?');
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
  // closing text; the editor's own template holds only the mode and outcome.
  it('starts a new finish screen asking to confirm and ending as completed', async () => {
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
    expect(
      within(screen.getByRole('listbox', { name: /Finishing/ })).getByRole(
        'option',
        { name: /Participants confirm/ },
      ),
    ).toHaveAttribute('aria-selected', 'true');
  });
});
