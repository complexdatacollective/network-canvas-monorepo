import { describe, expect, it } from 'vitest';

import { format, parse } from '../convert';

const mockConfiguration = {
  label: 'Person',
  color: 'coral',
  icon: 'add-a-person',
};

const mockFormConfiguration = {
  label: 'Person',
  color: 'coral',
  icon: 'add-a-person',
};

describe('convert', () => {
  describe('format()', () => {
    it('correctly converts protocol into form compatable version', () => {
      expect(format(mockConfiguration)).toMatchObject(mockFormConfiguration);
    });
  });

  describe('parse()', () => {
    it('correctly converts from form compatable version to protocol version', () => {
      expect(parse(mockFormConfiguration)).toEqual(mockConfiguration);
    });
  });
});

describe('an optional property the form cleared', () => {
  // Redux-form writes null for a section switched off, and the entity-type
  // reducers replace the whole definition with what they are handed. A null
  // reaching the protocol fails the schema that made the property optional,
  // so turning the synthetic section off would save an invalid definition.
  it('is dropped rather than saved as null', () => {
    expect(parse({ ...mockConfiguration, synthetic: null })).not.toHaveProperty(
      'synthetic',
    );
    expect(
      parse({ ...mockConfiguration, synthetic: undefined }),
    ).not.toHaveProperty('synthetic');
  });

  it('leaves a configured section untouched', () => {
    const synthetic = { count: { distribution: 'constant', value: 4 } };
    expect(parse({ ...mockConfiguration, synthetic })).toMatchObject({
      synthetic,
    });
  });
});
