import { configureStore } from '@reduxjs/toolkit';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';

import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';
import { CurrentStepProvider } from '~/contexts/CurrentStepContext';
import protocol from '~/store/modules/protocol';
import session from '~/store/modules/session';
import type { StageProps } from '~/types';

import NarrativePedigreeView from './NarrativePedigreeView';

const NODE_TYPE = 'person';
const EDGE_TYPE = 'family';
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const REL_TYPE_VAR = 'relationshipType';
const GAMETE_VAR = 'gameteRole';
const BIO_SEX_VAR = 'biologicalSex';
const REL_VAR = 'relationshipToEgo';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GENDER_VAR = 'gender';
const BREAST_CANCER_VAR = 'breastCancer';
const HAEMOPHILIA_VAR = 'haemophilia';

const SOURCE_STAGE_ID = 'source-fp';

type Attrs = Record<string, VariableValue>;

function node(id: string, attributes: Attrs): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: NODE_TYPE,
    [entityAttributesProperty]: attributes,
  };
}

function edge(id: string, from: string, to: string, attributes: Attrs): NcEdge {
  return {
    [entityPrimaryKeyProperty]: id,
    type: EDGE_TYPE,
    from,
    to,
    [entityAttributesProperty]: attributes,
  };
}

function bio(from: string, to: string): NcEdge {
  return edge(`${from}->${to}`, from, to, {
    [REL_TYPE_VAR]: ['biological'],
    [IS_ACTIVE_VAR]: true,
  });
}

// A three-generation pedigree:
//   grandmother (breast cancer +) --- grandfather
//                       |
//            mother --- father
//              |          |
//             +-- ego (haemophilia carrier line) --+
//              |
//            child
const nodes: NcNode[] = [
  node('grandmother', {
    [NAME_VAR]: 'Grandmother',
    [BIO_SEX_VAR]: 'female',
    [GENDER_VAR]: 'woman',
    [BREAST_CANCER_VAR]: true,
  }),
  node('grandfather', {
    [NAME_VAR]: 'Grandfather',
    [BIO_SEX_VAR]: 'male',
    [GENDER_VAR]: 'man',
  }),
  node('mother', {
    [NAME_VAR]: 'Mother',
    [BIO_SEX_VAR]: 'female',
    [GENDER_VAR]: 'woman',
  }),
  node('father', {
    [NAME_VAR]: 'Father',
    [BIO_SEX_VAR]: 'male',
    [GENDER_VAR]: 'man',
    [HAEMOPHILIA_VAR]: true,
  }),
  node('ego', {
    [NAME_VAR]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
    [GENDER_VAR]: 'woman',
  }),
  node('partner', {
    [NAME_VAR]: 'Partner',
    [BIO_SEX_VAR]: 'male',
    [GENDER_VAR]: 'man',
  }),
  node('child', {
    [NAME_VAR]: 'Child',
    [BIO_SEX_VAR]: 'male',
    [GENDER_VAR]: 'man',
  }),
];

const edges: NcEdge[] = [
  bio('grandmother', 'mother'),
  bio('grandfather', 'mother'),
  bio('mother', 'ego'),
  bio('father', 'ego'),
  bio('ego', 'child'),
  bio('partner', 'child'),
  edge('gm-gf', 'grandmother', 'grandfather', {
    [REL_TYPE_VAR]: ['partner'],
    [IS_ACTIVE_VAR]: true,
  }),
  edge('m-f', 'mother', 'father', {
    [REL_TYPE_VAR]: ['partner'],
    [IS_ACTIVE_VAR]: true,
  }),
  edge('ego-partner', 'ego', 'partner', {
    [REL_TYPE_VAR]: ['partner'],
    [IS_ACTIVE_VAR]: true,
  }),
];

const sourceStage = {
  id: SOURCE_STAGE_ID,
  type: 'FamilyPedigree' as const,
  label: 'Family Pedigree',
  subject: { entity: 'node' as const, type: NODE_TYPE },
  nodeConfig: {
    type: NODE_TYPE,
    nodeLabelVariable: NAME_VAR,
    egoVariable: EGO_VAR,
    relationshipVariable: REL_VAR,
    biologicalSexVariable: BIO_SEX_VAR,
  },
  edgeConfig: {
    type: EDGE_TYPE,
    relationshipTypeVariable: REL_TYPE_VAR,
    isActiveVariable: IS_ACTIVE_VAR,
    isGestationalCarrierVariable: IS_GEST_VAR,
    gameteRoleVariable: GAMETE_VAR,
  },
  censusPrompt: 'Build your pedigree.',
};

type NarrativeStage = StageProps<'NarrativePedigree'>['stage'];

const narrativeStage: NarrativeStage = {
  id: 'np-1',
  type: 'NarrativePedigree',
  label: 'Disease Pedigree',
  sourceStageId: SOURCE_STAGE_ID,
  diseases: [
    {
      id: 'breast-cancer',
      label: 'Breast Cancer',
      color: '#e53e3e',
      variable: asEntityAttributeReference(BREAST_CANCER_VAR),
      inheritancePattern: 'autosomalDominant',
    },
    {
      id: 'haemophilia',
      label: 'Haemophilia',
      color: '#3182ce',
      variable: asEntityAttributeReference(HAEMOPHILIA_VAR),
      inheritancePattern: 'xLinkedRecessive',
    },
  ],
};

const codebook = {
  node: {
    [NODE_TYPE]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: {
        default: 'diamond',
        dynamic: {
          variable: GENDER_VAR,
          type: 'discrete',
          map: [
            { value: 'man', shape: 'square' },
            { value: 'woman', shape: 'circle' },
          ],
        },
      },
      variables: {},
    },
  },
  edge: {
    [EDGE_TYPE]: { name: 'Family', color: 'edge-color-seq-1' },
  },
  ego: { variables: {} },
};

function makeStore() {
  return configureStore({
    reducer: { protocol, session },
    preloadedState: {
      protocol: {
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
      <Provider store={makeStore()}>
        <CurrentStepProvider currentStep={1} onStepChange={() => undefined}>
          <div className="h-screen w-screen">
            <Story />
          </div>
        </CurrentStepProvider>
      </Provider>
    ),
  ],
} satisfies Meta<typeof NarrativePedigreeView>;

export default meta;

type Story = StoryObj<typeof NarrativePedigreeView>;

export const Default: Story = {
  args: { stage: narrativeStage },
};
