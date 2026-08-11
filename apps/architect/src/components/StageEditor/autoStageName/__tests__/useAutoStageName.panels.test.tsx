import { configureStore } from '@reduxjs/toolkit';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import stageEditorDraft from '~/ducks/modules/stageEditorDraft';

// The interface registry pulls in every section component; the heading only
// needs the display metadata for one type.
vi.mock('../../Interfaces', () => ({
  getInterface: (type: string) => ({
    name: `Interface:${type}`,
    documentation: undefined,
  }),
}));

vi.mock('~/components/StageTypeImage', () => ({
  default: () => null,
}));

// A stand-in for the real panel row (which pulls in NetworkFilter's whole
// nested rule-builder tree) that registers the same stage-form leaves — see
// `nodePanelStub`.
vi.mock('../../../sections/NodePanels/NodePanel', async () => ({
  default: (
    await import('../../../sections/NodePanels/__tests__/nodePanelStub')
  ).default,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { NodePanels } from '../../../sections/NodePanels/NodePanels';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import StageForm from '../../StageForm';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { useSetStageValue } from '../../stageFormHooks';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import StageHeading from '../../StageHeading';

const protocol = {
  codebook: {
    node: { person: { name: 'Person', color: 'node-1', variables: {} } },
    edge: {},
  },
  stages: [{ id: 'other', type: 'Sociogram', label: 'An existing stage' }],
  assetManifest: {},
};

const toggle = () =>
  screen.getByRole('switch', { name: 'Turn this feature on or off' });

const stageName = () =>
  screen.getByRole('textbox', { name: 'Stage name' }) as HTMLInputElement;

function renderNameGeneratorWithPanels() {
  const store = configureStore({
    reducer: {
      stageEditorDraft,
      activeProtocol: () => ({ present: protocol }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

  const committedStage = {
    type: 'NameGenerator',
    subject: { entity: 'node', type: 'person' },
  } as unknown as Stage;

  let setStageValue: ((path: string, value: unknown) => void) | null = null;
  const Probe = () => {
    setStageValue = useSetStageValue();
    return null;
  };

  render(
    <Provider store={store}>
      <StageForm
        stageId={null}
        interfaceType="NameGenerator"
        committedStage={committedStage}
        onSubmit={() => ({ success: true })}
      >
        <Probe />
        <StageHeading stageNumber={1} totalStages={1} isNewStage />
        <NodePanels
          stagePath="stages[0]"
          stagePosition={0}
          interfaceType="NameGenerator"
        />
      </StageForm>
    </Provider>,
  );

  return {
    // The data source is chosen inside the panel row, which this suite stubs
    // out; writing the leaf is what that control does.
    setPanelDataSource: (index: number, dataSource: string) =>
      act(() => {
        setStageValue?.(`panels[${index}].dataSource`, dataSource);
      }),
  };
}

/** The section starts collapsed — no committed panels. */
const openSection = async () => {
  fireEvent.click(toggle());
  await waitFor(() => expect(toggle()).toHaveAttribute('aria-checked', 'true'));
};

/** Toggling off is confirmed by the global `useDialog` mock. */
const closeSection = async () => {
  fireEvent.click(toggle());
  await waitFor(() =>
    expect(toggle()).toHaveAttribute('aria-checked', 'false'),
  );
};

const addPanel = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add new panel' }));
  await waitFor(() =>
    expect(screen.getAllByTestId('node-panel')).toHaveLength(1),
  );
};

describe('useAutoStageName panel qualifier', () => {
  it('re-qualifies the generated name after panels are toggled off and re-added', async () => {
    const { setPanelDataSource } = renderNameGeneratorWithPanels();

    await waitFor(() =>
      expect(stageName()).toHaveValue('Person Form Name Generator'),
    );

    await openSection();
    await addPanel();
    await waitFor(() =>
      expect(stageName()).toHaveValue(
        'Person Form Name Generator with Network Panels',
      ),
    );

    await closeSection();
    await waitFor(() =>
      expect(stageName()).toHaveValue('Person Form Name Generator'),
    );

    // Regression: `removePanels` parks a dormant `panels: undefined` sentinel
    // on the container path, which outranks the values assembled from that
    // path's leaves for the rest of the session — so the auto-namer used to
    // see no panels ever again, even though the re-added panel really is
    // saved.
    await openSection();
    await addPanel();
    await waitFor(() =>
      expect(stageName()).toHaveValue(
        'Person Form Name Generator with Network Panels',
      ),
    );

    // The same staleness froze the qualifier against later refinements, so
    // switching the re-added panel to a roster no longer renamed the stage.
    setPanelDataSource(0, 'roster-asset');
    await waitFor(() =>
      expect(stageName()).toHaveValue(
        'Person Form Name Generator with Roster Panels',
      ),
    );
  });
});
