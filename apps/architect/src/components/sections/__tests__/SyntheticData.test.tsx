import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import SyntheticData from '~/components/sections/SyntheticData';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

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
});
