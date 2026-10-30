import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { egoFormStageEditor } from '../../../editors/ego-form/EgoFormStageEditor.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';

const FIXTURE_LANGUAGE = 'en-US';
const SETTINGS = sectionId({ kind: 'settings' });
const SUPPLIED_HINT = 'Scroll to see more questions';

const mountEgoForm = () =>
  renderStageEditor({ stageId: 'ego-form-1', registry: egoFormStageEditor });

/** The ego form's shared hint as the protocol holds it. */
const heldHint = (harness: ReturnType<typeof mountEgoForm>): unknown => {
  const settings = harness.protocolSections()[SETTINGS];
  const interfaceText = settings?.interfaceText as
    | Readonly<Record<string, Readonly<Record<string, unknown>>>>
    | undefined;
  return interfaceText?.egoForm?.scrollForQuestions;
};

/**
 * The words every stage of a kind shares, edited where the stage is: a stage
 * with nothing of its own to word shows them straight away, without the parts
 * a stage holding both opens and closes, and writes a change to the protocol
 * as the researcher leaves the field rather than with the stage.
 */
describe('a stage whose only built-in wording is shared', () => {
  it('shows the shared words without a part for the stage’s own', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );

    expect(
      await screen.findByRole('textbox', { name: 'More questions hint' }),
    ).toHaveValue(SUPPLIED_HINT);
    expect(
      screen.queryByRole('button', { name: 'Specific to this stage' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Shared by every stage of this kind',
      }),
    ).not.toBeInTheDocument();
  });

  it('writes a shared word to the protocol as the field is left, before the stage is saved', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.type(hint, 'More questions below');
    await harness.user.tab();

    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'More questions below',
      }),
    );
  });

  it('keeps a shared word the default language leaves empty out of the protocol', async () => {
    const harness = mountEgoForm();
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Customize built-in wording' }),
    );
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));

    await harness.user.clear(hint);
    await harness.user.tab();

    await waitFor(() => expect(hint).toHaveAccessibleDescription(/Required/));
    expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT });
  });

  it('puts Network Canvas’s wording back when switched off, once the researcher agrees', async () => {
    const harness = mountEgoForm();
    const section = await screen.findByRole('switch', {
      name: 'Customize built-in wording',
    });
    await harness.user.click(section);
    const hint = await screen.findByRole('textbox', {
      name: 'More questions hint',
    });
    await waitFor(() => expect(hint).not.toHaveAttribute('readonly'));
    await harness.user.clear(hint);
    await harness.user.type(hint, 'More questions below');
    await harness.user.tab();
    await waitFor(() =>
      expect(heldHint(harness)).toEqual({
        [FIXTURE_LANGUAGE]: 'More questions below',
      }),
    );

    await harness.user.click(section);
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Use Network Canvas’s wording',
      }),
    );

    await waitFor(() =>
      expect(heldHint(harness)).toEqual({ [FIXTURE_LANGUAGE]: SUPPLIED_HINT }),
    );
    expect(section).toHaveAttribute('aria-checked', 'false');
  });
});
