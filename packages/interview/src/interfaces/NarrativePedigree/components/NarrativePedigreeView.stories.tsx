import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';

import {
  asEntityAttributeReference,
  type PedigreeRelationshipKind,
  type PedigreeSexAssignedAtBirth,
  familyPedigreeWordingIn,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import protocol from '../../../store/modules/protocol';
import session from '../../../store/modules/session';
import ui from '../../../store/modules/ui';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import NarrativePedigreeView from './NarrativePedigreeView';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'family';
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const SEX_VAR = 'sexAssignedAtBirth';
const KIND_VAR = 'kind';
const CURRENT_VAR = 'currentPartner';
const CARRIER_VAR = 'gestationalCarrier';
const BREAST_CANCER_VAR = 'breastCancer';
const HAEMOPHILIA_VAR = 'haemophilia';

const SOURCE_STAGE_ID = 'source-fp';

type Attrs = Record<string, VariableValue>;

function person(
  id: string,
  name: string,
  sex: PedigreeSexAssignedAtBirth,
  attributes: Attrs = {},
): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: {
      [NAME_VAR]: name,
      [SEX_VAR]: [sex],
      ...attributes,
    },
  };
}

function link(
  from: string,
  to: string,
  kind: PedigreeRelationshipKind,
): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}`,
    type: EDGE_TYPE,
    from,
    to,
    [entityAttributesProperty]: {
      [KIND_VAR]: [kind],
      ...(kind === 'partner'
        ? { [CURRENT_VAR]: true }
        : { [CARRIER_VAR]: false }),
    },
  };
}

// A three-generation pedigree, as a Family Pedigree records it:
//   grandmother (breast cancer) --- grandfather
//                       |
//            mother --- father (haemophilia)
//                   |
//                  ego --- partner
//                       |
//                     child
// and a colleague, added on another stage, who shares the person type but is
// not family.
const nodes: NcNode[] = [
  person('grandmother', 'Grandmother', 'female', { [BREAST_CANCER_VAR]: true }),
  person('grandfather', 'Grandfather', 'male'),
  person('mother', 'Mother', 'female'),
  person('father', 'Father', 'male', { [HAEMOPHILIA_VAR]: true }),
  person('ego', 'Jo', 'female', { [EGO_VAR]: true }),
  person('partner', 'Partner', 'male'),
  person('child', 'Child', 'male'),
  person('colleague', 'Colleague', 'female'),
];

const edges: NcEdge[] = [
  link('grandmother', 'grandfather', 'partner'),
  link('grandmother', 'mother', 'biological'),
  link('grandfather', 'mother', 'biological'),
  link('mother', 'father', 'partner'),
  link('mother', 'ego', 'biological'),
  link('father', 'ego', 'biological'),
  link('ego', 'partner', 'partner'),
  link('ego', 'child', 'biological'),
  link('partner', 'child', 'biological'),
];

const sourceStage = {
  id: SOURCE_STAGE_ID,
  type: 'FamilyPedigree' as const,
  wording: familyPedigreeWordingIn(),
  label: { en: 'Family Pedigree' },
  subject: { entity: 'node' as const, type: NODE_TYPE },
  prompt: { en: 'Build your pedigree.' },
  nodeConfiguration: {
    nameAttribute: NAME_VAR,
    sexAssignedAtBirthAttribute: SEX_VAR,
    egoAttribute: EGO_VAR,
  },
  edgeConfiguration: {
    type: EDGE_TYPE,
    kindAttribute: KIND_VAR,
    gestationalCarrierAttribute: CARRIER_VAR,
    currentPartnerAttribute: CURRENT_VAR,
  },
};

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];

const narrativeStage: NarrativeStage = {
  id: 'np-1',
  type: 'NarrativePedigree',
  label: { en: 'Disease Pedigree' },
  sourceStageId: SOURCE_STAGE_ID,
  showAtRiskStatuses: false,
  diseases: [
    {
      id: 'breast-cancer',
      label: { en: 'Breast Cancer' },
      color: 'node-color-seq-1',
      attribute: asEntityAttributeReference(BREAST_CANCER_VAR),
      inheritancePattern: 'autosomalDominant',
    },
    {
      id: 'haemophilia',
      label: { en: 'Haemophilia' },
      color: 'node-color-seq-6',
      attribute: asEntityAttributeReference(HAEMOPHILIA_VAR),
      inheritancePattern: 'xLinkedRecessive',
    },
  ],
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-2',
      shape: {
        default: 'diamond',
        dynamic: {
          variable: SEX_VAR,
          type: 'discrete',
          map: [
            { value: 'male', shape: 'square' },
            { value: 'female', shape: 'circle' },
          ],
        },
      },
      variables: {},
    },
  },
  edge: {
    [EDGE_TYPE]: {
      name: 'Family',
      label: { en: 'Family' },
      color: 'edge-color-seq-1',
    },
  },
  ego: { variables: {} },
};

function makeStore() {
  return configureStore({
    reducer: { protocol, session, ui },
    preloadedState: {
      protocol: {
        localization: { defaultLocale: 'en', locales: ['en'] },
        codebook,
        stages: [sourceStage, narrativeStage],
        assets: [],
      } as never,
      session: {
        id: 'story-session',
        network: { nodes, edges, ego: { [entityAttributesProperty]: {} } },
        stageMetadata: {},
      } as never,
    },
    middleware: (g) => g({ serializableCheck: false }),
  });
}

const meta = {
  title: 'NarrativePedigree/NarrativePedigreeView',
  component: NarrativePedigreeView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TestProtocolLocalization>
        <Provider store={makeStore()}>
          <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
            <div className="h-screen w-screen">
              <Story />
            </div>
          </CurrentStepProvider>
        </Provider>
      </TestProtocolLocalization>
    ),
  ],
} satisfies Meta<typeof NarrativePedigreeView>;

export default meta;

type Story = StoryObj<typeof NarrativePedigreeView>;

/** The canvas's panned and zoomed content. */
const contentOf = (canvasElement: HTMLElement) => {
  const viewport = within(canvasElement).getByTestId('pedigree-canvas');
  const content = viewport.lastElementChild;
  if (!(content instanceof HTMLElement)) throw new Error('No canvas content');
  return content;
};
const scaleOf = (content: HTMLElement) =>
  new DOMMatrix(getComputedStyle(content).transform).a;

/**
 * The participant's family, opened whole on the Family Pedigree's canvas. The
 * colleague added on another stage is not family, so is not drawn.
 */
export const Default: Story = {
  args: { stage: narrativeStage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Focus on You' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Focus on Grandmother' }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Focus on Colleague' }),
    ).not.toBeInTheDocument();
    const box = canvas.getByTestId('pedigree-canvas').getBoundingClientRect();
    await waitFor(() => {
      for (const member of canvasElement.querySelectorAll(
        '[data-pedigree-member]',
      )) {
        const shown = member.getBoundingClientRect();
        expect(shown.left).toBeGreaterThanOrEqual(box.left);
        expect(shown.right).toBeLessThanOrEqual(box.right);
      }
    });
  },
};

/**
 * Zoom with the toolbar, the wheel, or + and −, and bring the whole family
 * back into view.
 */
export const Zoom: Story = {
  args: { stage: narrativeStage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: 'Focus on You' });
    const content = contentOf(canvasElement);
    const viewport = canvas.getByTestId('pedigree-canvas');

    const opened = scaleOf(content);
    await userEvent.click(canvas.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() => expect(scaleOf(content)).toBeGreaterThan(opened));

    const zoomedIn = scaleOf(content);
    const box = viewport.getBoundingClientRect();
    for (let notch = 0; notch < 3; notch++) {
      fireEvent.wheel(viewport, {
        deltaY: 100,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      });
    }
    await waitFor(() => expect(scaleOf(content)).toBeLessThan(zoomedIn));

    await userEvent.click(
      canvas.getByRole('button', { name: 'Show the whole family' }),
    );
    await waitFor(() => expect(scaleOf(content)).toBeCloseTo(opened, 2));
  },
};

/**
 * The family is a single tab stop; the arrow keys move between people by where
 * they sit in the tree, and + zooms in. Once a condition is chosen, Enter
 * focuses on a person and Escape clears it.
 */
export const KeyboardOperation: Story = {
  args: { stage: narrativeStage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const you = await canvas.findByRole('button', { name: 'Focus on You' });
    await expect(you).toHaveAttribute('tabindex', '0');
    you.focus();

    await userEvent.keyboard('{ArrowUp}');
    await expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Focus on (Mother|Father)$/,
    );

    const content = contentOf(canvasElement);
    const before = scaleOf(content);
    await userEvent.keyboard('+');
    await waitFor(() => expect(scaleOf(content)).toBeGreaterThan(before));

    await userEvent.click(
      canvas.getByRole('button', { name: 'Breast Cancer' }),
    );
    const youNow = canvas.getByRole('button', { name: 'Focus on You' });
    youNow.focus();
    await expect(youNow).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: 'Focus on You' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    );
    await expect(
      await canvas.findByRole('button', { name: 'Clear focus' }),
    ).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        canvas.queryByRole('button', { name: 'Clear focus' }),
      ).not.toBeInTheDocument(),
    );
  },
};
