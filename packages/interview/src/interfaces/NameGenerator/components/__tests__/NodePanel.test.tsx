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
// The component calls useStageSelector several times, so dispatch by the
// selector ref.
const stageSubject = { entity: 'node', type: 'person' };
const panelNodesSelector = vi.fn();
const stageVariables: Record<string, unknown> = {};

vi.mock('../../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    if (selector === panelNodesSelector) return panelNodesSelector();
    if (selector === 'getCodebookVariablesForSubjectType') {
      return stageVariables;
    }
    return stageSubject;
  },
}));

vi.mock('../../../../selectors/session', () => ({
  getStageSubject: 'getStageSubject',
}));

vi.mock('../../../../selectors/protocol', () => ({
  getCodebookVariablesForSubjectType: 'getCodebookVariablesForSubjectType',
}));

const passphraseState: { passphrase: string | null; isEnabled: boolean } = {
  passphrase: null,
  isEnabled: true,
};
const requirePassphrase = vi.fn();

vi.mock('../../../Anonymisation/usePassphrase', () => ({
  usePassphrase: () => ({
    passphrase: passphraseState.passphrase,
    isEnabled: passphraseState.isEnabled,
    requirePassphrase,
  }),
}));

vi.mock('../../../../selectors/name-generator', () => ({
  getPanelNodes: () => panelNodesSelector,
}));

// NodeList pulls in heavy dnd/collection machinery; stub it to a marker that
// reports the number of items it was asked to render.
vi.mock('../../../../components/NodeList', () => ({
  default: ({
    items,
    disabledKeys,
  }: {
    items: NcNode[];
    disabledKeys?: string[];
  }) => (
    <div
      data-testid="node-list"
      data-disabled-keys={disabledKeys ? disabledKeys.join(',') : undefined}
    >
      {items.length}
    </div>
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

const renderPanel = (disableDragging = false) =>
  render(
    <NodePanel
      panelConfig={externalPanelConfig}
      disableDragging={disableDragging}
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

  // The first frame of every external panel, before the effect that reads the
  // asset has run. Rendering the (empty) list here shows the participant a
  // panel with nothing in it, which is a claim about the researcher's data
  // made before any of it has been looked at.
  it('renders a loading indicator before the read has started', () => {
    externalDataMock.mockReturnValue({
      externalData: null,
      status: { state: 'idle' },
    });

    renderPanel();

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByTestId('node-list')).toBeNull();
  });

  it('renders a loading indicator while external data is loading', () => {
    externalDataMock.mockReturnValue({
      externalData: null,
      status: { state: 'loading' },
    });

    renderPanel();

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByTestId('node-list')).toBeNull();
  });

  it('renders an error message when external data fails to load', () => {
    externalDataMock.mockReturnValue({
      externalData: null,
      status: { state: 'error', error: new Error('Unknown asset id: xyz') },
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
      status: { state: 'ready' },
    });
    panelNodesSelector.mockReturnValue(rows);

    renderPanel();

    const list = screen.getByTestId('node-list');
    expect(list.textContent).toBe('2');
    expect(screen.queryByText('Loading...')).toBeNull();
    expect(screen.queryByText(/External data could not be loaded/i)).toBeNull();
  });
});

describe('NodePanel node limit enforcement', () => {
  const rows = [makeNode('a'), makeNode('b')];

  beforeEach(() => {
    externalDataMock.mockReturnValue({
      externalData: rows,
      status: { state: 'ready' },
    });
    panelNodesSelector.mockReturnValue(rows);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('leaves panel nodes draggable when the node limit has not been reached', () => {
    renderPanel();

    expect(
      screen.getByTestId('node-list').getAttribute('data-disabled-keys'),
    ).toBeNull();
  });

  it('disables every panel node once the node limit has been reached', () => {
    renderPanel(true);

    expect(
      screen.getByTestId('node-list').getAttribute('data-disabled-keys'),
    ).toBe('a,b');
  });
});

describe('NodePanel external data with encrypted values', () => {
  const rows: NcNode[] = [
    {
      [entityPrimaryKeyProperty]: 'a',
      [entityAttributesProperty]: { name: 'Alice' },
      type: 'person',
    },
  ];

  beforeEach(() => {
    stageVariables.name = { name: 'name', type: 'text', encrypted: true };
    externalDataMock.mockReturnValue({
      externalData: rows,
      status: { state: 'ready' },
    });
    panelNodesSelector.mockReturnValue(rows);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    delete stageVariables.name;
    passphraseState.passphrase = null;
    passphraseState.isEnabled = true;
  });

  it('asks for the passphrase and holds the rows back until one is entered', () => {
    renderPanel();

    expect(requirePassphrase).toHaveBeenCalled();
    expect(screen.queryByTestId('node-list')).toBeNull();
    expect(screen.getByText(/enter your passphrase/i)).toBeTruthy();
  });

  it('offers the rows once the passphrase has been entered', () => {
    passphraseState.passphrase = 'secret';

    renderPanel();

    expect(requirePassphrase).not.toHaveBeenCalled();
    expect(screen.getByTestId('node-list').textContent).toBe('1');
  });

  it('offers the rows without a passphrase while the experiment is off', () => {
    passphraseState.isEnabled = false;

    renderPanel();

    expect(requirePassphrase).not.toHaveBeenCalled();
    expect(screen.getByTestId('node-list').textContent).toBe('1');
  });
});
