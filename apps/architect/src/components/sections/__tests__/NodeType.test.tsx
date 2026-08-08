import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stage, StageType } from '@codaco/protocol-validation';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

const confirm = vi.fn();
const openDialog = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm, openDialog }),
}));

import NodeType from '../NodeType';

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {},
    },
    place: {
      name: 'Place',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {},
    },
  },
  edge: {},
  ego: { variables: {} },
};

const setup = (
  committedStage: Record<string, unknown> = {},
  interfaceType: StageType = 'NameGenerator',
) => {
  const stage = asStage({
    id: 'stage-1',
    type: interfaceType,
    ...committedStage,
  });

  const { getFormValues } = renderStageForm({
    committedStage: stage,
    extraReducers: {
      activeProtocol: () => ({ present: { codebook, stages: [stage] } }),
    },
    children: (
      <NodeType
        stagePath={null}
        stagePosition={0}
        interfaceType={interfaceType}
      />
    ),
  });

  return { getFormValues };
};

describe('NodeType', () => {
  beforeEach(() => {
    confirm.mockReset();
    openDialog.mockReset();
    confirm.mockImplementation(({ onConfirm }: { onConfirm?: () => void }) =>
      onConfirm?.(),
    );
  });

  it('keeps the selected subject on a fresh stage instead of resetting it to null', () => {
    const { getFormValues } = setup();

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Person' }));

    expect(getFormValues().subject).toEqual({ entity: 'node', type: 'person' });
  });

  it('records the newly selected subject when it changes', () => {
    const { getFormValues } = setup({
      subject: { entity: 'node', type: 'person' },
    } satisfies Partial<Stage> as Record<string, unknown>);

    fireEvent.click(screen.getByRole('radio', { name: 'Select node Place' }));

    expect(getFormValues().subject).toEqual({ entity: 'node', type: 'place' });
  });
});
