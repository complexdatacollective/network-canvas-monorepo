import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import type { NcEdge, NcNode } from '@codaco/shared-consts';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import type * as sessionSelectors from '../../../selectors/session';
import type * as interviewStore from '../../../store/store';
import type { StageProps } from '../../../types';
import FamilyPedigree from '../FamilyPedigree';
import { useFamilyPedigreeStore } from '../FamilyPedigreeContext';
import type * as edgeUtils from '../utils/edgeUtils';
import type * as nodeUtils from '../utils/nodeUtils';
import type * as stageConfig from '../utils/stageConfig';

const fixtures = vi.hoisted(() => ({
  nodes: [
    { _uid: 'ego', type: 'person', attributes: { isEgo: true } },
    {
      _uid: 'relative',
      type: 'person',
      attributes: { label: 'Ana & <literal>', isEgo: false },
    },
  ] satisfies NcNode[],
  edges: [] as NcEdge[],
  metadata: {},
  dispatch: vi.fn(),
  updateReady: vi.fn(),
  track: vi.fn(),
}));

// Keep the real stage, pedigree provider/store, locale provider and live
// region. Only replace its unrelated host selectors/navigation and the two
// child controls that produce count/checklist events, so this regression
// exercises the stage's actual event detection and announcement lifetime.
vi.mock('../../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: () => unknown) => selector(),
}));
vi.mock('../../../selectors/session', async (importOriginal) => ({
  ...(await importOriginal<typeof sessionSelectors>()),
  getNetworkNodes: () => fixtures.nodes,
  getNetworkEdges: () => fixtures.edges,
  getStageMetadata: () => fixtures.metadata,
}));
vi.mock('../../../store/store', async (importOriginal) => ({
  ...(await importOriginal<typeof interviewStore>()),
  useAppDispatch: () => fixtures.dispatch,
}));
vi.mock('../../../contexts/CurrentStepContext', () => ({
  useCurrentStep: () => ({ currentStep: 0 }),
}));
vi.mock('../../../hooks/useBeforeNext', () => ({ default: () => {} }));
vi.mock('../../../hooks/useReadyForNextStage', () => ({
  default: () => ({ updateReady: fixtures.updateReady }),
}));
vi.mock('../../../analytics/useTrack', () => ({
  useTrack: () => fixtures.track,
}));
vi.mock('../../../contract/context', () => ({
  useContractFlags: () => ({ isDevelopment: false }),
}));
vi.mock('../../../components/Prompts/Prompts', () => ({
  default: () => null,
}));
vi.mock('../familyPedigreeDialog', () => ({
  useFamilyPedigreeDialog: () => ({ confirm: vi.fn(), openDialog: vi.fn() }),
}));
vi.mock('../utils/nodeUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof nodeUtils>()),
  getNodeTypeKey: () => 'person',
  getNodeLabelVariable: () => 'label',
  getEgoVariable: () => 'isEgo',
  getRelationshipVariable: () => 'relationship',
  getBiologicalSexVariable: () => 'biologicalSex',
}));
vi.mock('../utils/edgeUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof edgeUtils>()),
  getEdgeTypeKey: () => 'family',
  getRelationshipTypeVariable: () => 'relationshipType',
  getIsActiveVariable: () => 'isActive',
  getIsGestationalCarrierVariable: () => 'isGestationalCarrier',
  getGameteRoleVariable: () => 'gameteRole',
}));
vi.mock('../utils/stageConfig', async (importOriginal) => ({
  ...(await importOriginal<typeof stageConfig>()),
  getFramingConfig: () => ({ mode: 'fixed', value: 'gamete' }),
  getBoundaries: () => ({
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  }),
}));
vi.mock('../pedigree-layout/components/PedigreeView', () => ({
  default: function EditMembers() {
    const nodes = useFamilyPedigreeStore((state) => state.network.nodes);
    const originalName = nodes.get('relative')?.attributes.label;
    const addNode = useFamilyPedigreeStore((state) => state.addNode);
    const removeNode = useFamilyPedigreeStore((state) => state.removeNode);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            addNode({ id: 'added-relative', attributes: { label: 'Irene' } })
          }
        >
          Add relative
        </button>
        <button type="button" onClick={() => removeNode('added-relative')}>
          Remove relative
        </button>
        <output aria-label="Original name">
          {typeof originalName === 'string' ? originalName : null}
        </output>
      </>
    );
  },
}));
vi.mock('../components/PedigreeChecklist', () => ({
  default: function Checklist({
    onAllDoneChange,
  }: {
    onAllDoneChange: (done: boolean) => void;
  }) {
    return (
      <label>
        Complete checklist
        <input
          type="checkbox"
          onChange={(event) => onAllDoneChange(event.currentTarget.checked)}
        />
      </label>
    );
  },
}));

const props = {
  stage: {
    id: 'pedigree',
    type: 'FamilyPedigree',
    label: 'Original stage label',
    censusPrompt: 'Original prompt',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: asEntityAttributeReference('label'),
      egoVariable: asEntityAttributeReference('isEgo'),
      relationshipVariable: asEntityAttributeReference('relationship'),
      biologicalSexVariable: asEntityAttributeReference('biologicalSex'),
    },
    edgeConfig: {
      type: 'family',
      relationshipTypeVariable: asEntityAttributeReference('relationshipType'),
      isActiveVariable: asEntityAttributeReference('isActive'),
      isGestationalCarrierVariable: asEntityAttributeReference(
        'isGestationalCarrier',
      ),
      gameteRoleVariable: asEntityAttributeReference('gameteRole'),
    },
  },
  getNavigationHelpers: () => ({ moveForward: vi.fn(), moveBackward: vi.fn() }),
} satisfies StageProps<'FamilyPedigree'>;

describe('FamilyPedigree build announcements', () => {
  it('consumes add, remove and completion events while later actions use the current language', async () => {
    const user = userEvent.setup();
    const view = (locale: string) => (
      <InterviewI18nProvider requestedLocale={locale}>
        <FamilyPedigree {...props} />
      </InterviewI18nProvider>
    );
    const { rerender } = render(view('en'));
    await user.click(screen.getByRole('button', { name: 'Add relative' }));
    const added =
      'Family member added. Your family pedigree now has 2 members.';
    const region = await screen.findByText(added);

    // A current success can finish being spoken, but changing language must
    // not rewrite that past event as if another relative had just been added.
    rerender(view('es'));
    expect(region).toHaveTextContent(added);
    await waitFor(() => expect(region).toBeEmptyDOMElement(), {
      timeout: 2000,
    });

    await user.click(screen.getByRole('button', { name: 'Remove relative' }));
    await waitFor(() =>
      expect(region).toHaveTextContent(
        'Familiar eliminado. Tu árbol familiar ahora tiene 1 familiar.',
      ),
    );
    await waitFor(() => expect(region).toBeEmptyDOMElement(), {
      timeout: 2000,
    });
    await user.click(screen.getByRole('button', { name: 'Add relative' }));
    await waitFor(() =>
      expect(region).toHaveTextContent(
        'Familiar añadido. Tu árbol familiar ahora tiene 2 familiares.',
      ),
    );
    await waitFor(() => expect(region).toBeEmptyDOMElement(), {
      timeout: 2000,
    });

    await user.click(
      screen.getByRole('checkbox', { name: 'Complete checklist' }),
    );
    const completed =
      'Todas las tareas están completas. Ya puedes finalizar tu árbol familiar.';
    await waitFor(() => expect(region).toHaveTextContent(completed));
    rerender(view('en-GB'));
    expect(region).toHaveTextContent(completed);
    await waitFor(() => expect(region).toBeEmptyDOMElement(), {
      timeout: 2000,
    });
    await user.click(
      screen.getByRole('checkbox', { name: 'Complete checklist' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Complete checklist' }),
    );
    await waitFor(() =>
      expect(region).toHaveTextContent(
        'All tasks are complete. You can now finalise your family pedigree.',
      ),
    );
    expect(
      screen.getByRole('status', { name: 'Original name' }),
    ).toHaveTextContent('Ana & <literal>');
  });
});
