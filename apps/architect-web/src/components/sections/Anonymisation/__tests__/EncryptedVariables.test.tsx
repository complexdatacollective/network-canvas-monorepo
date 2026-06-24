import { describe, expect, it } from 'vitest';

import { getEncryptableVariableOptions } from '../EncryptedVariables';

// Encryption only supports text variables (the secure-attribute path encrypts
// strings only). The picker must therefore offer only text variables, so a
// non-text variable can never be flagged encrypted and silently stored plaintext.
describe('getEncryptableVariableOptions', () => {
  it('offers only text variables', () => {
    const variables = {
      name: { name: 'Name', type: 'text' },
      age: { name: 'Age', type: 'number' },
      gender: { name: 'Gender', type: 'categorical' },
      bio: { name: 'Bio', type: 'text' },
      active: { name: 'Active', type: 'boolean' },
    };

    expect(getEncryptableVariableOptions(variables)).toEqual([
      { value: 'name', label: 'Name' },
      { value: 'bio', label: 'Bio' },
    ]);
  });

  it('returns an empty list when there are no text variables', () => {
    const variables = {
      age: { name: 'Age', type: 'number' },
    };

    expect(getEncryptableVariableOptions(variables)).toEqual([]);
  });
});
