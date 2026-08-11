import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

const confirm = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm }),
}));

import MinMaxAlterLimits from '../MinMaxAlterLimits';

const STAGE_PROPS = {
  stagePath: null,
  stagePosition: 0,
  interfaceType: 'NameGenerator' as const,
};

describe('MinMaxAlterLimits', () => {
  beforeEach(() => {
    confirm.mockReset();
  });

  it('starts collapsed with no committed limits', () => {
    renderStageForm({
      committedStage: asStage({}),
      children: <MinMaxAlterLimits {...STAGE_PROPS} />,
    });

    expect(
      screen.queryByLabelText(/Minimum Number of Alters/),
    ).not.toBeInTheDocument();
  });

  it('starts expanded and shows the committed values as integers', () => {
    renderStageForm({
      committedStage: asStage({ behaviours: { minNodes: 2, maxNodes: 5 } }),
      children: <MinMaxAlterLimits {...STAGE_PROPS} />,
    });

    expect(screen.getByLabelText(/Minimum Number of Alters/)).toHaveValue(2);
    expect(screen.getByLabelText(/Maximum Number of Alters/)).toHaveValue(5);
  });

  it('parses typed digits to an integer and clears on an empty input', async () => {
    const { getFieldState } = renderStageForm({
      committedStage: asStage({}),
      children: <MinMaxAlterLimits {...STAGE_PROPS} />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    const minInput = await screen.findByLabelText(/Minimum Number of Alters/);
    fireEvent.change(minInput, { target: { value: '3' } });
    expect(getFieldState('behaviours.minNodes')?.value).toBe(3);

    fireEvent.change(minInput, { target: { value: '' } });
    expect(getFieldState('behaviours.minNodes')?.value).toBeUndefined();
  });

  it('clears both values through the confirm dialog when toggled off', async () => {
    confirm.mockImplementation(
      async ({ onConfirm }: { onConfirm?: () => void }) => {
        onConfirm?.();
        return true;
      },
    );

    const { getFieldState } = renderStageForm({
      committedStage: asStage({ behaviours: { minNodes: 2, maxNodes: 5 } }),
      children: <MinMaxAlterLimits {...STAGE_PROPS} />,
    });

    fireEvent.click(screen.getByTitle('Turn this feature on or off'));

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Minimum Number of Alters/),
      ).not.toBeInTheDocument();
    });
    expect(getFieldState('behaviours.minNodes')?.value).toBeUndefined();
    expect(getFieldState('behaviours.maxNodes')?.value).toBeUndefined();
  });
});
