import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Panel as PanelType } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

const externalDataMock = vi.fn();

vi.mock('../../../../hooks/useExternalData', () => ({
  default: (...args: unknown[]) => externalDataMock(...args),
}));

// getStageSubject returns the stage subject; getPanelNodes returns a selector.
// The component calls useStageSelector twice, so dispatch by the selector ref.
const stageSubject = { entity: 'node', type: 'person' };
const panelNodesSelector = vi.fn();

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) =>
    selector === panelNodesSelector ? panelNodesSelector() : stageSubject,
}));

vi.mock('../../../../selectors/session', () => ({
  getStageSubject: 'getStageSubject',
}));

vi.mock('../../../../selectors/name-generator', () => ({
  getPanelNodes: () => panelNodesSelector,
}));

// NodeList pulls in heavy dnd/collection machinery; stub it to a marker that
// reports the number of items it was asked to render.
vi.mock('../../../../components/NodeList', () => ({
  default: ({ items }: { items: NcNode[] }) => (
    <div data-testid="node-list">{items.length}</div>
  ),
}));

vi.mock('../ExternalNodeItem', () => ({
  default: () => <div data-testid="external-node-item" />,
}));

import NodePanel from '../NodePanel';

const externalPanelConfig: PanelType = {
  id: 'panel-1',
  title: 'External Panel',
  dataSource: 'asset-1',
};

const makeNode = (id: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type: 'person',
});

const renderPanel = () =>
  render(
    <NodePanel
      panelConfig={externalPanelConfig}
      disableDragging={false}
      accepts={[]}
      panelNumber={0}
      minimize={false}
      onDrop={vi.fn()}
      onUpdate={vi.fn()}
      id="panel-1"
    />,
  );

describe('NodePanel external-data status handling', () => {
  beforeEach(() => {
    panelNodesSelector.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a loading indicator while external data is loading', () => {
    externalDataMock.mockReturnValue({
      externalData: null,
      status: { isLoading: true, error: null },
    });

    renderPanel();

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByTestId('node-list')).toBeNull();
  });

  it('renders an error message when external data fails to load', () => {
    externalDataMock.mockReturnValue({
      externalData: null,
      status: { isLoading: false, error: new Error('Unknown asset id: xyz') },
    });

    renderPanel();

    expect(screen.getByText(/External data could not be loaded/i)).toBeTruthy();
    expect(screen.queryByTestId('node-list')).toBeNull();
    // Error UI must be visibly distinct from a successfully-loaded empty panel.
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('renders the node list once external data has loaded successfully', () => {
    const rows = [makeNode('a'), makeNode('b')];
    externalDataMock.mockReturnValue({
      externalData: rows,
      status: { isLoading: false, error: null },
    });
    panelNodesSelector.mockReturnValue(rows);

    renderPanel();

    const list = screen.getByTestId('node-list');
    expect(list.textContent).toBe('2');
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByText(/External data could not be loaded/i)).toBeNull();
  });
});
