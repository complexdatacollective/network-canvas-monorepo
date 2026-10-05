import type { Codebook } from '@codaco/protocol-validation';
import {
  caseProperty,
  codebookHashProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  protocolName,
  protocolProperty,
  sessionExportTimeProperty,
  sessionFinishTimeProperty,
  sessionProperty,
  sessionStartTimeProperty,
} from '@codaco/shared-consts';

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
 * Record ids stay in `[a-zA-Z0-9._:-]`; every name is what a researcher might
 * type once names are free: other scripts, spaces, punctuation, quotes and
 * commas (which CSV must quote).
 */
export const namesCodebook = {
  ego: {
    variables: {
      'ego-name': { name: 'Nom (prénom)', type: 'text' },
      'ego-answer': {
        name: 'Réponse oui/non',
        type: 'categorical',
        options: [
          { label: 'Oui', value: 'oui' },
          { label: 'Peut-être', value: 'peut être' },
          { label: 'Non', value: 'non' },
        ],
      },
    },
  },
  node: {
    person: {
      name: 'Close Friend',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-name': { name: 'Full name', type: 'text' },
        'p-age': { name: '年齢 (years)', type: 'number' },
        'p-pos': { name: 'map position', type: 'layout' },
        'p-eyes': {
          name: 'Eye colour, "natural"',
          type: 'categorical',
          options: [
            { label: 'Light blue', value: 'light blue' },
            { label: 'Brown', value: '褐色' },
            { label: 'Five', value: 5 },
          ],
        },
        'p-rank': {
          name: 'Rank #',
          type: 'ordinal',
          options: [
            { label: 'Low', value: 1 },
            { label: 'High', value: 2 },
          ],
        },
        'p-close': { name: 'Is this person close?', type: 'boolean' },
      },
    },
    place: {
      name: '場所',
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        'pl-name': { name: 'Full name', type: 'text' },
        'pl-note': { name: 'Note / remarks', type: 'text' },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows well',
      color: 'edge-color-seq-1',
      variables: {
        'k-kind': {
          name: 'Kind of tie',
          type: 'categorical',
          options: [
            { label: 'Family', value: 'family member' },
            { label: 'Friend', value: 'ami' },
          ],
        },
        'k-weight': { name: 'weight (%)', type: 'number' },
      },
    },
  },
} satisfies Codebook;

export const namesSession = (): FormattedSession => ({
  nodes: [
    {
      [entityPrimaryKeyProperty]: 'node-a',
      type: 'person',
      [entityAttributesProperty]: {
        'p-name': 'Dee',
        'p-age': 40,
        'p-pos': { x: 0.25, y: 0.5 },
        'p-eyes': ['light blue', 5],
        'p-rank': 2,
        'p-close': true,
      },
    },
    {
      [entityPrimaryKeyProperty]: 'node-b',
      type: 'person',
      [entityAttributesProperty]: { 'p-name': 'Carl, "C"', 'p-age': 3.5 },
    },
    {
      [entityPrimaryKeyProperty]: 'node-c',
      type: 'place',
      [entityAttributesProperty]: {
        'pl-name': 'Home',
        'pl-note': 'next to the café',
      },
    },
  ],
  edges: [
    {
      [entityPrimaryKeyProperty]: 'edge-a',
      from: 'node-a',
      to: 'node-b',
      type: 'knows',
      [entityAttributesProperty]: {
        'k-kind': ['family member'],
        'k-weight': 2,
      },
    },
  ],
  ego: {
    [entityPrimaryKeyProperty]: 'ego-1',
    [entityAttributesProperty]: {
      'ego-name': 'Enzo',
      'ego-answer': ['peut être'],
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
