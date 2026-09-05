import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import FixtureStageEditorHost from '../FixtureStageEditorHost.tsx';
import { NameGeneratorRosterStageEditor } from '../NameGeneratorRosterStageEditor.tsx';

/**
 * The host the editors' stories mount inside, and the one thing their play
 * functions assert: that a stage saved through it says so. Nothing else in
 * this package builds a session the way a host does, and a story cannot fail
 * a build — so without this, the stories break silently.
 */
describe('the host the stage-editor stories mount inside', () => {
  it('opens a fixture stage, saves it, and says so', async () => {
    const user = userEvent.setup();
    render(
      <FixtureStageEditorHost stageId="name-generator-roster-1">
        {(controller) => (
          <NameGeneratorRosterStageEditor
            controller={controller}
            stageType="NameGeneratorRoster"
          />
        )}
      </FixtureStageEditorHost>,
    );

    await screen.findByText(
      'The people in it carry these attributes: age, name.',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await user.click(screen.getByRole('button', { name: 'Save stage' }));
    await waitFor(() =>
      expect(screen.getByText('Stage saved')).toBeInTheDocument(),
    );
  });
});
