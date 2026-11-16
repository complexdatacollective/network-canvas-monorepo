/* eslint-env jest */

import { getVariableOptionsForSubject, makeGetVariable } from '..';
import testState from '../../../__tests__/testState.json';

describe('codebook selectors', () => {
  describe('getVariableOptionsForSubject()', () => {
    it('extracts variables for nodeType into options list for node entity', () => {
      const subject = {
        type: 'bar',
        entity: 'node',
      };

      const result = getVariableOptionsForSubject(testState, subject);

      expect(result).toMatchSnapshot();
    });

    it('extracts variables for nodeType into options list for ego entity', () => {
      const subject = {
        type: undefined,
        entity: 'ego',
      };

      const result = getVariableOptionsForSubject(testState, subject);

      expect(result).toMatchSnapshot();
    });
  });

  describe('makeGetVariable()', () => {
    it('returns null if variable is not found', () => {
      const result = makeGetVariable('not found')(testState);

      expect(result).toBeNull();
    });

    it('returns error if codebook is not found', () => {
      expect(() => makeGetVariable('foo')({})).toThrow();
    });
  });
});
