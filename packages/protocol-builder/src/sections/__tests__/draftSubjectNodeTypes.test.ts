import { describe, expect, it } from 'vitest';

import { testTypeId } from '../../testing/testId.ts';
import { draftSubjectNodeTypes } from '../useStageSubject.ts';

const PERSON = testTypeId('person');
const PLACE = testTypeId('place');

describe('reading the node types of a draft subject', () => {
  it.each([
    ['one type', { entity: 'node', types: [PERSON] }, [PERSON]],
    ['two types', { entity: 'node', types: [PERSON, PLACE] }, [PERSON, PLACE]],
  ])('reads a node subject listing %s', (_, subject, expected) => {
    expect(draftSubjectNodeTypes(subject)).toEqual(expected);
  });

  it.each([
    ['an empty list', { entity: 'node', types: [] }],
    ['a list holding a number', { entity: 'node', types: [PERSON, 1] }],
    ['a list holding an empty id', { entity: 'node', types: [''] }],
    ['types as a string', { entity: 'node', types: PERSON }],
    ['the schema 8 shape', { entity: 'node', type: PERSON }],
    ['an edge subject', { entity: 'edge', type: PERSON }],
    ['an ego subject', { entity: 'ego' }],
    ['nothing', undefined],
    ['null', null],
  ])('reads no node types from %s', (_, subject) => {
    expect(draftSubjectNodeTypes(subject)).toBeUndefined();
  });
});
