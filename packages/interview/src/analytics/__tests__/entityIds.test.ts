import { describe, expect, it } from 'vitest';

import {
  createEntityIdPseudonymiser,
  pseudonymiseEntityIds,
} from '../entityIds';

describe('createEntityIdPseudonymiser', () => {
  it('never returns the id it was given', () => {
    const pseudonymise = createEntityIdPseudonymiser();
    expect(pseudonymise('person_9tPq3v')).not.toBe('person_9tPq3v');
  });

  it('returns one stable pseudonym per id within a session', () => {
    const pseudonymise = createEntityIdPseudonymiser();
    const first = pseudonymise('person_9tPq3v');
    expect(pseudonymise('person_9tPq3v')).toBe(first);
  });

  it('gives different ids different pseudonyms', () => {
    const pseudonymise = createEntityIdPseudonymiser();
    expect(pseudonymise('a')).not.toBe(pseudonymise('b'));
  });

  it('gives the same id different pseudonyms in different sessions', () => {
    const sessionOne = createEntityIdPseudonymiser();
    const sessionTwo = createEntityIdPseudonymiser();
    expect(sessionOne('person_9tPq3v')).not.toBe(sessionTwo('person_9tPq3v'));
  });
});

describe('pseudonymiseEntityIds', () => {
  it('replaces every entity-id property', () => {
    const pseudonymise = createEntityIdPseudonymiser();
    const props = pseudonymiseEntityIds(
      {
        node_id: 'n1',
        edge_id: 'e1',
        node_a_id: 'n2',
        node_b_id: 'n3',
        entity_id: 'n4',
      },
      pseudonymise,
    );
    expect(props).toEqual({
      node_id: pseudonymise('n1'),
      edge_id: pseudonymise('e1'),
      node_a_id: pseudonymise('n2'),
      node_b_id: pseudonymise('n3'),
      entity_id: pseudonymise('n4'),
    });
  });

  it('leaves deliberately stable identifiers and non-id props untouched', () => {
    const props = pseudonymiseEntityIds(
      {
        installation_id: 'install-1',
        distinct_id: 'session-1',
        node_type: 'person',
        bin_index: 2,
      },
      createEntityIdPseudonymiser(),
    );
    expect(props).toEqual({
      installation_id: 'install-1',
      distinct_id: 'session-1',
      node_type: 'person',
      bin_index: 2,
    });
  });

  it('passes through an omitted id rather than inventing one', () => {
    const props = pseudonymiseEntityIds(
      { node_id: undefined, node_type: 'person' },
      createEntityIdPseudonymiser(),
    );
    expect(props).toEqual({ node_id: undefined, node_type: 'person' });
  });

  it('does not mutate the props it was handed', () => {
    const original = { node_id: 'n1' };
    pseudonymiseEntityIds(original, createEntityIdPseudonymiser());
    expect(original).toEqual({ node_id: 'n1' });
  });

  it('tolerates absent props', () => {
    expect(
      pseudonymiseEntityIds(undefined, createEntityIdPseudonymiser()),
    ).toBeUndefined();
  });
});
