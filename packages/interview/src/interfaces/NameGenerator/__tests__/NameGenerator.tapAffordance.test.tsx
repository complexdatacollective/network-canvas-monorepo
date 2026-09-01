import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Form } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import type { StageProps } from '../../../types';

// The main list is the subject: capture the props it is handed. Everything
// else the stage renders is stubbed, so the test says nothing about the
// interview machinery and only about whether a tap is offered.
const nodeListProps: { onItemClick?: (node: NcNode) => void }[] = [];

vi.mock('../../../components/NodeList', () => ({
  default: (props: { id?: string; onItemClick?: (node: NcNode) => void }) => {
    if (props.id === 'MAIN_NODE_LIST') nodeListProps.push(props);
    return <div data-testid="node-list" />;
  },
}));

vi.mock('../../../components/NodeBin', () => ({ default: () => null }));
vi.mock('../../../components/Prompts', () => ({ default: () => null }));
vi.mock('../components/NodePanels', () => ({ default: () => null }));
vi.mock('../components/NodeForm', () => ({ default: () => null }));
vi.mock('../components/QuickNodeForm', () => ({ default: () => null }));

vi.mock('../../../components/Prompts/usePrompts', () => ({
  usePrompts: () => ({
    prompt: { id: 'p1', text: 'Prompt' },
    promptIndex: 0,
    prompts: [{ id: 'p1', text: 'Prompt' }],
  }),
}));
vi.mock('../../../contexts/CurrentStepContext', () => ({
  useCurrentStep: () => 0,
}));
vi.mock('../../../hooks/useMediaQuery', () => ({ default: () => false }));
vi.mock('../../../hooks/useNodeLimits', () => ({
  default: () => ({ maxNodesReached: false, minNodesReached: true }),
}));
vi.mock('../../../hooks/usePortalTarget', () => ({ default: () => null }));
vi.mock('../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) =>
    typeof selector === 'function' ? [] : {},
}));
vi.mock('../../../store/store', () => ({ useAppDispatch: () => vi.fn() }));
vi.mock('../../Anonymisation/usePassphrase', () => ({
  usePassphrase: () => ({
    requirePassphrase: vi.fn(),
    passphrase: null,
    isEnabled: false,
  }),
}));

const { default: NameGenerator } = await import('../NameGenerator');

const stage = (overrides: Record<string, unknown>) =>
  ({
    id: 'stage-1',
    label: 'Stage',
    subject: { entity: 'node' as const, type: 'person' },
    prompts: [{ id: 'p1', text: 'Prompt' }],
    ...overrides,
  }) as unknown as StageProps<'NameGenerator'>['stage'];

const renderStage = (stageConfig: ReturnType<typeof stage>) => {
  nodeListProps.length = 0;
  render(
    <NameGenerator
      stage={stageConfig}
      getNavigationHelpers={() => ({
        moveForward: vi.fn(),
        moveBackward: vi.fn(),
      })}
    />,
  );
  return nodeListProps.at(-1);
};

describe('NameGenerator main list tap affordance', () => {
  it('offers no tap when the stage has no form to open', () => {
    // A quick-add stage carries no form, so tapping a node could only ever
    // do nothing — the node must not advertise a press.
    const props = renderStage(stage({ type: 'NameGeneratorQuickAdd' }));

    expect(props).toBeDefined();
    expect(props?.onItemClick).toBeUndefined();
  });

  it('offers the tap when a form exists to edit the node in', () => {
    const props = renderStage(
      stage({
        type: 'NameGenerator',
        form: { title: 'Edit', fields: [] } as unknown as Form,
      }),
    );

    expect(props?.onItemClick).toBeInstanceOf(Function);
  });
});
