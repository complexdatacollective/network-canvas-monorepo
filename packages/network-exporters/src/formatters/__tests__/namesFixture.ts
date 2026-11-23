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

import { testTypeId, testVariableId } from '../../__tests__/testIds';
import type { FormattedSession, SessionWithResequencedIDs } from '../../input';
import type { ExportOptions } from '../../options';
import { insertEgoIntoSessionNetwork } from '../../session/insertEgoIntoSessionNetworks';
import { resequenceSessionIds } from '../../session/resequenceIds';

export const exportOptions = (
  useScreenLayoutCoordinates: boolean,
): ExportOptions => ({
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
});

/*
 * Record ids are UUIDs; every name is what a researcher might
 * type once names are free: other scripts, spaces, punctuation, quotes and
 * commas (which CSV must quote).
 */
export const namesCodebook = {
  ego: {
    variables: {
      [testVariableId('ego-name')]: {
        name: 'Nom (prénom)',
        type: 'text',
      },
      [testVariableId('ego-answer')]: {
        name: 'Réponse oui/non',
        type: 'categorical',
        options: [
          { label: { en: 'Yes' }, value: 'oui' },
          { label: { en: 'Maybe' }, value: 'peut être' },
          { label: { en: 'No' }, value: 'non' },
        ],
      },
    },
  },
  node: {
    [testTypeId('person')]: {
      name: 'Close Friend',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        [testVariableId('p-name')]: {
          name: 'Full name',
          type: 'text',
        },
        [testVariableId('p-age')]: {
          name: '年齢 (years)',
          type: 'number',
        },
        [testVariableId('p-pos')]: {
          name: 'map position',
          type: 'layout',
        },
        [testVariableId('p-eyes')]: {
          name: 'Eye colour, "natural"',
          type: 'categorical',
          options: [
            { label: { en: 'Light blue' }, value: 'light blue' },
            { label: { en: 'Brown' }, value: '褐色' },
            { label: { en: 'Five' }, value: 5 },
          ],
        },
        [testVariableId('p-rank')]: {
          name: 'Rank #',
          type: 'ordinal',
          options: [
            { label: { en: 'Low' }, value: 1 },
            { label: { en: 'High' }, value: 2 },
          ],
        },
        [testVariableId('p-close')]: {
          name: 'Is this person close?',
          type: 'boolean',
        },
      },
    },
    [testTypeId('place')]: {
      name: '場所',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        [testVariableId('pl-name')]: {
          name: 'Full name',
          type: 'text',
        },
        [testVariableId('pl-note')]: {
          name: 'Note / remarks',
          type: 'text',
        },
      },
    },
  },
  edge: {
    [testTypeId('knows')]: {
      name: 'Knows well',
      color: 'edge-color-seq-1',
      variables: {
        [testVariableId('k-kind')]: {
          name: 'Kind of tie',
          type: 'categorical',
          options: [
            { label: { en: 'Family' }, value: 'family member' },
            { label: { en: 'Friend' }, value: 'ami' },
          ],
        },
        [testVariableId('k-weight')]: {
          name: 'weight (%)',
          type: 'number',
        },
      },
    },
  },
} satisfies Codebook;

export const namesSession = (): FormattedSession => ({
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'node-a',
      type: testTypeId('person'),
      [entityAttributesProperty]: {
        [testVariableId('p-name')]: 'Dee',
        [testVariableId('p-age')]: 40,
        [testVariableId('p-pos')]: { x: 0.25, y: 0.5 },
        [testVariableId('p-eyes')]: ['light blue', 5],
        [testVariableId('p-rank')]: 2,
        [testVariableId('p-close')]: true,
      },
    },
    {
      [entityPrimaryKeyProperty]: 'node-b',
      type: testTypeId('person'),
      [entityAttributesProperty]: {
        [testVariableId('p-name')]: 'Carl, "C"',
        [testVariableId('p-age')]: 3.5,
      },
    },
    {
      [entityPrimaryKeyProperty]: 'node-c',
      type: testTypeId('place'),
      [entityAttributesProperty]: {
        [testVariableId('pl-name')]: 'Home',
        [testVariableId('pl-note')]: 'next to the café',
      },
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'edge-a',
      from: 'node-a',
      to: 'node-b',
      type: testTypeId('knows'),
      [entityAttributesProperty]: {
        [testVariableId('k-kind')]: ['family member'],
        [testVariableId('k-weight')]: 2,
      },
    },
  ],
  ego: {
    [entityPrimaryKeyProperty]: 'ego-1',
    [entityAttributesProperty]: {
      [testVariableId('ego-name')]: 'Enzo',
      [testVariableId('ego-answer')]: ['peut être'],
    },
  },
  sessionVariables: {
    [caseProperty]: 'case-1',
    [protocolName]: 'protocol name',
    [protocolProperty]: 'protocol-1',
    [sessionProperty]: 'session-1',
    [sessionStartTimeProperty]: '100',
    [sessionFinishTimeProperty]: '200',
    [sessionExportTimeProperty]: '300',
    [codebookHashProperty]: 'hash',
    [finishOutcomeProperty]: 'completed',
    APP_VERSION: 'v',
    COMMIT_HASH: 'c',
  },
});

export const prepareSession = (
  session: FormattedSession,
): SessionWithResequencedIDs =>
  resequenceSessionIds(insertEgoIntoSessionNetwork(session));

// The first record of a CSV, quotes included: enough to read a header row or
// one row of data.
export const parseCsvRecord = (csv: string): string[] => {
  const record: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      break;
    } else {
      field += character;
    }
  }
  record.push(field);
  return record;
};
