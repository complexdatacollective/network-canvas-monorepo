import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import SyntheticData from '~/components/sections/SyntheticData';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// The min/max section clears its values behind a confirmation, so the one test
// below that turns it off auto-confirms, as MinMaxAlterLimits' own tests do.
const confirm = vi.fn(async ({ onConfirm }: { onConfirm?: () => void }) => {
  onConfirm?.();
  return true;
});

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm }),
}));

import MinMaxAlterLimits from '~/components/sections/MinMaxAlterLimits';

/**
 * `getFormValues()` includes REGISTERED fields only, so a section that writes
 * its value through `setFieldValue` on an unregistered path has it parked in
 * the store's dormant map: the controls update, and finishing the edit drops
 * every change. The stage update is overwrite-style, so that also means saving
 * an imported stage silently deletes metadata it already carried.
 */

const sectionProps = {
  form: 'edit-stage',
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'NameGenerator' as StageType,
};

const declared = {
  count: { distribution: 'constant', value: 4 },
};

describe('the stage synthetic-data section', () => {
  it('puts what the author enters into the submitted form values', async () => {
    const { getFormValues } = renderStageForm({
      committedStage: asStage({ id: 'stage-1', type: 'NameGenerator' }),
      children: <SyntheticData {...sectionProps} />,
    });

    fireEvent.click(await screen.findByRole('switch'));

    await waitFor(() => {
      expect(getFormValues()).toHaveProperty('synthetic');
    });
  });

  /**
   * `StageForm` submits with `noValidate`, so the nested controls' `min`, `max`
   * and `step` do not gate Finished Editing, and `StageEditor` consults full
   * protocol validation only to disable Preview. The registered field's own
   * rule is therefore the only thing between an author and a stage the schema
   * rejects.
   */
  it('refuses a block the stage schema rejects', async () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'NameGenerator',
        // A fractional population: schema-invalid, and every control that
        // would have objected is bypassed by `noValidate`.
        synthetic: { count: { distribution: 'constant', value: 2.5 } },
      }),
      children: <SyntheticData {...sectionProps} />,
    });

    await expect(getStoreApi().getState().validateForm()).resolves.toBe(false);
  });

  it('accepts a block the stage schema allows', async () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'NameGenerator',
        synthetic: declared,
      }),
      children: <SyntheticData {...sectionProps} />,
    });

    await expect(getStoreApi().getState().validateForm()).resolves.toBe(true);
  });

  it('refuses a count outside the stage behavior window', async () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'NameGenerator',
        behaviours: { maxNodes: 5 },
        synthetic: { count: { distribution: 'constant', value: 20 } },
      }),
      children: <SyntheticData {...sectionProps} />,
    });

    await expect(getStoreApi().getState().validateForm()).resolves.toBe(false);
  });

  it('refuses a density outside its domain on a topology stage', async () => {
    const { getStoreApi } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'Sociogram',
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1.5 },
          },
        },
      }),
      children: <SyntheticData {...sectionProps} interfaceType="Sociogram" />,
    });

    await expect(getStoreApi().getState().validateForm()).resolves.toBe(false);
  });

  it('carries an imported stage metadata through an untouched save', () => {
    const { getFormValues } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'NameGenerator',
        synthetic: declared,
      }),
      children: <SyntheticData {...sectionProps} />,
    });

    // Nothing is edited: the section only has to not lose what was there.
    expect(getFormValues().synthetic).toEqual(declared);
  });

  /**
   * The count is checked against the alter window the stage is ABOUT TO BE
   * SAVED with, not the one it arrived carrying. Turning "Min/max alters" off
   * clears both limits and unmounts their fields, so they leave
   * `getFormValues()` altogether; reading the `behaviours` container path here
   * would find nothing registered and fall back to the committed stage, and go
   * on refusing a count that nothing in the edited stage rules out. The author
   * would be unable to finish the edit at all.
   */
  it('accepts a count once the alter window that refused it has been cleared', async () => {
    const { getStoreApi, getFormValues } = renderStageForm({
      committedStage: asStage({
        id: 'stage-1',
        type: 'NameGenerator',
        behaviours: { maxNodes: 5 },
        synthetic: { count: { distribution: 'constant', value: 20 } },
      }),
      children: (
        <>
          <MinMaxAlterLimits {...sectionProps} />
          <SyntheticData {...sectionProps} />
        </>
      ),
    });

    // While the window is live, 20 is correctly out of reach.
    await expect(getStoreApi().getState().validateForm()).resolves.toBe(false);

    // The author turns the section off and confirms "Clear values".
    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Maximum Number of Alters/),
      ).not.toBeInTheDocument();
    });
    expect(getFormValues()).not.toHaveProperty('behaviours.maxNodes');

    await expect(getStoreApi().getState().validateForm()).resolves.toBe(true);
  });
});
