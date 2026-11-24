import { groupBy } from 'es-toolkit';

import type { Codebook } from '@codaco/protocol-validation';
import {
  caseProperty,
  codebookHashProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  finishOutcomeProperty,
  protocolName,
  protocolProperty,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

import { testTypeId, testVariableId } from '../../../__tests__/testIds';
import type { FormattedSession } from '../../../input';
import type { ExportOptions } from '../../../options';
import { insertEgoIntoSessionNetwork } from '../../../session/insertEgoIntoSessionNetworks';
import { resequenceSessionIds } from '../../../session/resequenceIds';

// The mock uses simplified color values and variable types not present in the
// strict Codebook schema (e.g. 'layout' type, bare 'color' string), so a cast
// is required — the same approach used in createGraphML.test.ts.
export const mockCodebook = {
  ego: {
    variables: {
      [testVariableId('mock-uuid-1')]: { name: 'egoName', type: 'text' },
      [testVariableId('mock-uuid-2')]: { name: 'egoAge', type: 'number' },
      [testVariableId('mock-uuid-3')]: { name: 'boolVar', type: 'boolean' },
    },
  },
  node: {
    [testTypeId('mock-node-type')]: {
      name: 'person',
      color: 'color',
      variables: {
        [testVariableId('mock-uuid-1')]: { name: 'firstName', type: 'text' },
        [testVariableId('mock-uuid-2')]: { name: 'age', type: 'number' },
        [testVariableId('mock-uuid-3')]: { name: 'layout', type: 'layout' },
        [testVariableId('mock-uuid-4')]: {
          name: 'boolWithValues',
          type: 'boolean',
        },
        [testVariableId('mock-uuid-5')]: { name: 'nullBool', type: 'boolean' },
        [testVariableId('mock-uuid-6')]: {
          name: 'unusedBool',
          type: 'boolean',
        },
      },
    },
    [testTypeId('mock-node-type-2')]: {
      name: 'organization',
      color: 'color',
      variables: {
        [testVariableId('unrepresented-node-variable')]: {
          name: 'unrepresentedNodeVariable',
          type: 'text',
        },
      },
    },
  },
  edge: {
    [testTypeId('mock-edge-type')]: {
      name: 'peer',
      color: 'color',
      variables: {
        [testVariableId('relationship-uuid')]: {
          name: 'RelationshipType',
          type: 'categorical',
          options: [
            { value: 'parent', label: 'Parent' },
            { value: 'partner', label: 'Partner' },
            { value: 'friend', label: 'Friend' },
          ],
        },
      },
    },
    [testTypeId('mock-edge-type-2')]: {
      name: 'likes',
      color: 'color',
      variables: {
        [testVariableId('unrepresented-edge-variable')]: {
          name: 'unrepresentedEdgeVariable',
          type: 'boolean',
        },
      },
    },
  },
} as unknown as Codebook;

export const mockExportOptions: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: true,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

export const mockNetwork: FormattedSession = {
  nodes: [
    {
      [entityPrimaryKeyProperty]: '1',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Dee',
        [testVariableId('mock-uuid-2')]: 40,
        [testVariableId('mock-uuid-3')]: { x: 0, y: 0 },
        [testVariableId('mock-uuid-4')]: true,
      },
    },
    {
      [entityPrimaryKeyProperty]: '2',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Carl',
        [testVariableId('mock-uuid-2')]: 0,
        [testVariableId('mock-uuid-3')]: { x: 0, y: 0 },
        [testVariableId('mock-uuid-4')]: false,
      },
    },
    {
      [entityPrimaryKeyProperty]: '3',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Jumbo',
        [testVariableId('mock-uuid-2')]: 50,
        [testVariableId('mock-uuid-4')]: true,
      },
    },
    {
      [entityPrimaryKeyProperty]: '4',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Francis',
        [testVariableId('mock-uuid-2')]: 10,
        [testVariableId('mock-uuid-3')]: { x: 0, y: 0 },
      },
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'edge-1',
      from: '1',
      to: '2',
      type: testTypeId('mock-edge-type'),
      [entityAttributesProperty]: {
        [testVariableId('relationship-uuid')]: 'partner',
      },
    },
  ],
  ego: {
    [entityPrimaryKeyProperty]: 'ego-id-1',
    [entityAttributesProperty]: {
      [testVariableId('mock-uuid-1')]: 'Enzo',
      [testVariableId('mock-uuid-2')]: 40,
      [testVariableId('mock-uuid-3')]: false,
    },
  },
  sessionVariables: {
    [caseProperty]: '123',
    [protocolName]: 'protocol name',
    [protocolProperty]: 'protocol-uid-1',
    [sessionProperty]: 'session-id-1',
    [sessionStartTimeProperty]: '100',
    [sessionFinishTimeProperty]: '200',
    [sessionExportTimeProperty]: '300',
    [codebookHashProperty]: '14fa461bf4b98155e82adc86532938553b4d33a9',
    [finishOutcomeProperty]: 'completed',
    APP_VERSION: 'mock-app-version',
    COMMIT_HASH: 'mock-commit-hash',
  },
};

export const mockNetwork2: FormattedSession = {
  nodes: [
    {
      [entityPrimaryKeyProperty]: '10',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Jimbo',
        [testVariableId('mock-uuid-2')]: 20,
        [testVariableId('mock-uuid-3')]: { x: 10, y: 50 },
      },
    },
    {
      [entityPrimaryKeyProperty]: '20',
      type: testTypeId('mock-node-type'),
      [entityAttributesProperty]: {
        [testVariableId('mock-uuid-1')]: 'Jambo',
        [testVariableId('mock-uuid-2')]: 30,
        [testVariableId('mock-uuid-3')]: { x: 20, y: 20 },
      },
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'edge-10',
      from: '10',
      to: '20',
      type: testTypeId('mock-edge-type'),
      [entityAttributesProperty]: {},
    },
  ],
  ego: {
    [entityPrimaryKeyProperty]: 'ego-id-10',
    [entityAttributesProperty]: {
      [testVariableId('mock-uuid-1')]: 'Enzo',
      [testVariableId('mock-uuid-2')]: 40,
      [testVariableId('mock-uuid-3')]: true,
    },
  },
  sessionVariables: {
    [caseProperty]: '456',
    [protocolName]: 'protocol name',
    [protocolProperty]: 'protocol-uid-1',
    [sessionProperty]: 'session-id-2',
    [sessionStartTimeProperty]: '1000',
    [sessionFinishTimeProperty]: '2000',
    [sessionExportTimeProperty]: '3000',
    [codebookHashProperty]: '14fa461bf4b98155e82adc86532938553b4d33a9',
    [finishOutcomeProperty]: 'completed',
    APP_VERSION: 'mock-app-version',
    COMMIT_HASH: 'mock-commit-hash',
  },
};

export const processMockNetworks = (networkCollection: FormattedSession[]) => {
  const sessions = networkCollection
    .map(insertEgoIntoSessionNetwork)
    .map(resequenceSessionIds);
  return groupBy(sessions, (s) => s.sessionVariables[protocolProperty]);
};
