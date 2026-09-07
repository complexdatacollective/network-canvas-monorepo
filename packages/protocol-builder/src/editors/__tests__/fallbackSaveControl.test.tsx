import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/** See each editor's own test for why the rich-text editor is stood in for. */
vi.mock('../../fields/RichTextField.tsx', () => ({
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

const READ_ONLY_REFUSAL =
  'This stage is read-only, so your changes were not saved. Take over editing and try again.';

const FAMILIES = [
  { family: 'form', stageId: 'information-1', settleLabel: 'Page heading' },
] as const;

/**
 * An editor that composed no save control of its own falls back to this one,
 * and it answers a spectator rather than going quiet on them.
 *
 * Disabling it while the session is read-only was the alternative, and it
 * explains nothing to anybody — it is not even the honest state, because
 * access can be taken away between the render that read it and the submit
 * itself. So the control stays pressable and the shell answers the press with
 * the reason the stage was not saved. The table is per family because the
 * control is above all of them: which family an interface belongs to is not a
 * reason for a save button to behave differently.
 */
describe('the save control an editor falls back to', () => {
  it.each(FAMILIES)(
    'stays pressable for a $family spectator, and says why the stage did not save',
    async ({ stageId, settleLabel }) => {
      // Through the package's own dispatcher, so each family's editor arrives
      // with whatever save control it actually falls back to.
      const harness = renderStageEditor({ stageId });
      await screen.findByRole('textbox', { name: settleLabel });

      harness.setReadOnly();

      const save = await screen.findByRole('button', { name: 'Save stage' });
      await waitFor(() =>
        expect(
          screen.getByRole('textbox', { name: settleLabel }),
        ).toBeDisabled(),
      );
      expect(save).toBeEnabled();

      await harness.user.click(save);

      expect(await screen.findByText(READ_ONLY_REFUSAL)).toBeInTheDocument();
    },
  );
});
