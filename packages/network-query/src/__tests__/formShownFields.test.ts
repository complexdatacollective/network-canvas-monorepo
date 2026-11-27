import { describe, expect, it } from 'vitest';

import {
  type ContentNodes,
  type DynamicValueRole,
  dynamicValueNameFor,
  type ParsedDynamicValuePath,
  printContentDocument,
} from '@codaco/protocol-validation';

import { formDocumentReading, formShownFields } from '../formShownFields.ts';

// While a form is on screen the interview always knows today's date, the
// label of the node that the form describes and the labels of the two nodes
// that an edge form's edge joins. Every reader of a form's logic reads them
// as present, so the interview and synthetic data show the same fields; a
// label of a node that the form does not describe stays missing.

const KNOWN = 'field-known';
const MISSING = 'field-missing';

/** A form that shows one field when `value` is known and another when it is missing. */
const formReading = (value: ParsedDynamicValuePath) => {
  const content: ContentNodes = [
    {
      kind: 'logic',
      logic: {
        kind: 'answers',
        value: dynamicValueNameFor(value),
        missing: [{ kind: 'field', fieldId: MISSING }],
        versions: [],
        other: [{ kind: 'field', fieldId: KNOWN }],
      },
    },
  ];
  return formDocumentReading(
    {
      fields: [
        { id: KNOWN, variable: 'known' },
        { id: MISSING, variable: 'missing' },
      ],
    },
    { text: printContentDocument(content), locale: 'en' },
  );
};

/** The fields shown on a form that answers `answers`, with nothing else known. */
const shownOn = (answers: DynamicValueRole, value: ParsedDynamicValuePath) =>
  formShownFields(formReading(value), { attributes: {} }, answers).shown;

describe('formShownFields reads what the interview always knows while a form is on screen', () => {
  it('reads today’s date as known on every form', () => {
    for (const answers of ['ego', 'node', 'edge'] as const) {
      expect(shownOn(answers, { kind: 'intrinsic', name: 'now' })).toEqual([
        KNOWN,
      ]);
    }
  });

  it('reads the label of the node that a node form describes as known', () => {
    expect(shownOn('node', { kind: 'label', role: 'node' })).toEqual([KNOWN]);
  });

  it('reads the labels of the two nodes that an edge form’s edge joins as known', () => {
    expect(shownOn('edge', { kind: 'label', role: 'edgeFrom' })).toEqual([
      KNOWN,
    ]);
    expect(shownOn('edge', { kind: 'label', role: 'edgeTo' })).toEqual([KNOWN]);
  });

  it('reads the label of a node that the form does not describe as missing', () => {
    expect(shownOn('ego', { kind: 'label', role: 'node' })).toEqual([MISSING]);
    expect(shownOn('node', { kind: 'label', role: 'edgeFrom' })).toEqual([
      MISSING,
    ]);
    expect(shownOn('edge', { kind: 'label', role: 'node' })).toEqual([MISSING]);
  });

  it('keeps a date and a label that the caller gives', () => {
    const reading = formReading({ kind: 'label', role: 'node' });
    expect(
      formShownFields(
        reading,
        { attributes: {}, labels: { node: 'Ada' }, intrinsics: { now: 1 } },
        'node',
      ).shown,
    ).toEqual([KNOWN]);
  });
});
