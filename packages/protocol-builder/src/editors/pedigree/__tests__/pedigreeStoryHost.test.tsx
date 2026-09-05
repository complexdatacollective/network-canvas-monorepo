import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AnonymisationStageEditor } from '../AnonymisationStageEditor.tsx';
import { FamilyPedigreeStageEditor } from '../FamilyPedigreeStageEditor.tsx';
import { NarrativePedigreeStageEditor } from '../NarrativePedigreeStageEditor.tsx';
import { PedigreeStoryHost } from '../pedigreeStoryHost.tsx';
import { shimMarkdownEditorMeasurement } from './editorFixtures.tsx';

shimMarkdownEditorMeasurement();

/**
 * The Storybook host, driven the way each story's `play` drives it.
 *
 * Storybook's own interaction runner is not part of this package's test
 * command, so a story whose play had gone stale — a control renamed, the saved
 * document reported differently — would fail nowhere until a Chromatic build.
 * These run the same three journeys against the same host, so the plays cannot
 * rot silently between builds. They are deliberately the SAME assertions, not
 * a paraphrase: a selector that only matches here proves nothing about them.
 */
describe('the Storybook host the pedigree stories run in', () => {
  it('saves a rewritten anonymisation explanation', async () => {
    const user = userEvent.setup();
    render(
      <PedigreeStoryHost
        stageId="anonymisation-1"
        renderEditor={({ controller, actions }) => (
          <AnonymisationStageEditor
            controller={controller}
            stageType="Anonymisation"
            actions={actions}
          />
        )}
      />,
    );

    expect(screen.getByText('Nothing saved yet.')).toBeInTheDocument();
    const heading = screen.getByRole('textbox', {
      name: 'Explanation heading',
    });
    await user.clear(heading);
    await user.type(heading, 'Your answers are protected');
    await user.click(screen.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(screen.getByText('Saved “Anonymisation”.')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Your answers are protected/)).toBeInTheDocument();
  });

  it('saves a tightened pedigree boundary', async () => {
    const user = userEvent.setup();
    render(
      <PedigreeStoryHost
        stageId="family-pedigree-1"
        renderEditor={({ controller, actions }) => (
          <FamilyPedigreeStageEditor
            controller={controller}
            stageType="FamilyPedigree"
            actions={actions}
          />
        )}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Grandparent requirement' }),
      'required',
    );
    await user.click(screen.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(screen.getByText('Saved “Family Pedigree”.')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/"requireGrandparents": "required"/),
    ).toBeInTheDocument();
  });

  it('saves at-risk statuses switched on', async () => {
    const user = userEvent.setup();
    render(
      <PedigreeStoryHost
        stageId="narrative-pedigree-1"
        renderEditor={({ controller, actions }) => (
          <NarrativePedigreeStageEditor
            controller={controller}
            stageType="NarrativePedigree"
            actions={actions}
          />
        )}
      />,
    );

    await user.click(
      screen.getByRole('switch', { name: 'Show possible (at-risk) statuses' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save stage' }));

    await waitFor(() =>
      expect(
        screen.getByText('Saved “Narrative Pedigree”.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/"showAtRiskStatuses": true/)).toBeInTheDocument();
  });

  /** A spectator's chrome says so rather than offering a save that is refused. */
  it('disables the host’s save control for a spectator', () => {
    render(
      <PedigreeStoryHost
        stageId="anonymisation-1"
        readOnly
        renderEditor={({ controller, actions }) => (
          <AnonymisationStageEditor
            controller={controller}
            stageType="Anonymisation"
            actions={actions}
          />
        )}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save stage' })).toBeDisabled();
  });
});
