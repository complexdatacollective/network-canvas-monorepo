import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ArchitectField from '~/components/Form/ArchitectField';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const confirm = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm }),
}));

// A faithful-enough stand-in for `SkipLogicFields`: it registers the same
// three leaf paths production does (`skipLogic.action`/`.filter`/
// `.destination` — never a single `skipLogic` field), seeded from the
// committed stage, so this test can verify SkipLogic's clear-on-toggle-off
// actually reaches the fields it renders rather than an unregistered
// `skipLogic` parent path.
const Probe = (({ value }: { value?: unknown }) => (
  <span data-testid="value">{JSON.stringify(value)}</span>
)) as ComponentType<Record<string, unknown>>;

vi.mock('~/components/sections/fields/SkipLogicFields', () => ({
  default: function MockSkipLogicFields() {
    const action = useStageInitialValue('skipLogic.action');
    const filter = useStageInitialValue('skipLogic.filter');
    const destination = useStageInitialValue('skipLogic.destination');
    return (
      <div data-testid="skip-logic-fields">
        <ArchitectField
          name="skipLogic.action"
          label="skipLogic.action"
          component={Probe}
          initialValue={action}
        />
        <ArchitectField
          name="skipLogic.filter"
          label="skipLogic.filter"
          component={Probe}
          initialValue={filter}
        />
        <ArchitectField
          name="skipLogic.destination"
          label="skipLogic.destination"
          component={Probe}
          initialValue={destination}
        />
      </div>
    );
  },
}));

import SkipLogic from '../SkipLogic';

const STAGE_PROPS = { stagePath: null, stagePosition: 0 };

const COMMITTED_SKIP_LOGIC = {
  action: 'SKIP',
  filter: { rules: [] },
  destination: { type: 'finish' },
};

describe('SkipLogic', () => {
  beforeEach(() => {
    confirm.mockReset();
  });

  it('starts collapsed with no committed skip logic', () => {
    renderStageForm({
      committedStage: asStage({}),
      children: <SkipLogic {...STAGE_PROPS} interfaceType="EgoForm" />,
    });

    expect(screen.queryByTestId('skip-logic-fields')).not.toBeInTheDocument();
  });

  it('starts expanded and hydrates all three leaf fields from the committed stage', () => {
    const { getFieldState } = renderStageForm({
      committedStage: asStage({ skipLogic: COMMITTED_SKIP_LOGIC }),
      children: <SkipLogic {...STAGE_PROPS} interfaceType="EgoForm" />,
    });

    expect(screen.getByTestId('skip-logic-fields')).toBeInTheDocument();
    expect(getFieldState('skipLogic.action')?.value).toBe('SKIP');
    expect(getFieldState('skipLogic.filter')?.value).toEqual({ rules: [] });
    expect(getFieldState('skipLogic.destination')?.value).toEqual({
      type: 'finish',
    });
  });

  it('clears all three leaf fields through the confirm dialog when toggled off', async () => {
    confirm.mockImplementation(
      async ({ onConfirm }: { onConfirm?: () => void }) => {
        onConfirm?.();
        return true;
      },
    );

    const { getFieldState } = renderStageForm({
      committedStage: asStage({ skipLogic: COMMITTED_SKIP_LOGIC }),
      children: <SkipLogic {...STAGE_PROPS} interfaceType="EgoForm" />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'This will clear your skip logic' }),
    );

    await waitFor(() => {
      expect(screen.queryByTestId('skip-logic-fields')).not.toBeInTheDocument();
    });
    expect(getFieldState('skipLogic.action')?.value).toBeUndefined();
    expect(getFieldState('skipLogic.filter')?.value).toBeUndefined();
    expect(getFieldState('skipLogic.destination')?.value).toBeUndefined();
  });

  it('does not resurrect the old rules when reopened after a clear', async () => {
    confirm.mockImplementation(
      async ({ onConfirm }: { onConfirm?: () => void }) => {
        onConfirm?.();
        return true;
      },
    );

    renderStageForm({
      committedStage: asStage({ skipLogic: COMMITTED_SKIP_LOGIC }),
      children: <SkipLogic {...STAGE_PROPS} interfaceType="EgoForm" />,
    });

    // Turn off (clears and collapses), then back on.
    fireEvent.click(screen.getByTitle('Turn this feature on or off'));
    await waitFor(() => {
      expect(screen.queryByTestId('skip-logic-fields')).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    await screen.findByTestId('skip-logic-fields');
    expect(screen.getAllByTestId('value').map((el) => el.textContent)).toEqual([
      '',
      '',
      '',
    ]);
  });

  it('keeps skipLogic when the confirm dialog is cancelled', async () => {
    confirm.mockResolvedValue(false);

    renderStageForm({
      committedStage: asStage({ skipLogic: COMMITTED_SKIP_LOGIC }),
      children: <SkipLogic {...STAGE_PROPS} interfaceType="EgoForm" />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    await vi.waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });
    expect(screen.getByTestId('skip-logic-fields')).toBeInTheDocument();
  });
});
