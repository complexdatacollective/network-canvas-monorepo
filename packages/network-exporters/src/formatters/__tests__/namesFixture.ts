import type { Codebook } from '@codaco/protocol-validation';
import {
  caseProperty,
  codebookHashProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  interviewLocaleProperty,
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
      'ego-name': {
        name: 'Nom (prénom)',
        label: { en: 'Name (first name)' },
        type: 'text',
      },
      'ego-answer': {
        name: 'Réponse oui/non',
        label: { en: 'Yes/no answer' },
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
    person: {
      name: 'Close Friend',
      label: { en: 'Close friend' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        'p-name': {
          name: 'Full name',
          label: { en: 'Full name' },
          type: 'text',
        },
        'p-age': {
          name: '年齢 (years)',
          label: { en: 'Age (years)' },
          type: 'number',
        },
        'p-pos': {
          name: 'map position',
          label: { en: 'Map position' },
          type: 'layout',
        },
        'p-eyes': {
          name: 'Eye colour, "natural"',
          label: { en: 'Eye colour' },
          type: 'categorical',
          options: [
            { label: { en: 'Light blue' }, value: 'light blue' },
            { label: { en: 'Brown' }, value: '褐色' },
            { label: { en: 'Five' }, value: 5 },
          ],
        },
        'p-rank': {
          name: 'Rank #',
          label: { en: 'Rank' },
          type: 'ordinal',
          options: [
            { label: { en: 'Low' }, value: 1 },
            { label: { en: 'High' }, value: 2 },
          ],
        },
        'p-close': {
          name: 'Is this person close?',
          label: { en: 'Is this person close?' },
          type: 'boolean',
        },
      },
    },
    place: {
      name: '場所',
      label: { en: 'Place' },
      color: 'node-color-seq-2',
      shape: { default: 'square' },
      variables: {
        'pl-name': {
          name: 'Full name',
          label: { en: 'Full name' },
          type: 'text',
        },
        'pl-note': {
          name: 'Note / remarks',
          label: { en: 'Note' },
          type: 'text',
        },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows well',
      label: { en: 'Knows well' },
      color: 'edge-color-seq-1',
      variables: {
        'k-kind': {
          name: 'Kind of tie',
          label: { en: 'Kind of tie' },
          type: 'categorical',
          options: [
            { label: { en: 'Family' }, value: 'family member' },
            { label: { en: 'Friend' }, value: 'ami' },
          ],
        },
        'k-weight': {
          name: 'weight (%)',
          label: { en: 'Weight (%)' },
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
    [interviewLocaleProperty]: null,
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
