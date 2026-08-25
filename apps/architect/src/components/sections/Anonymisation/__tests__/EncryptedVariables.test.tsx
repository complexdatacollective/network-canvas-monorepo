import { describe, expect, it, vi } from 'vitest';

import {
  getEncryptableVariableOptions,
  requestEncryptionSectionChange,
} from '../EncryptedVariables';

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

describe('requestEncryptionSectionChange', () => {
  it('retains encrypted selections when clearing is cancelled', async () => {
    const clearSelections = vi.fn();

    await expect(
      requestEncryptionSectionChange({
        hasEncryptedVariable: true,
        nextOpen: false,
        confirmClear: async () => false,
        clearSelections,
      }),
    ).resolves.toBe(false);
    expect(clearSelections).not.toHaveBeenCalled();
  });

  it('clears encrypted selections when closing is confirmed', async () => {
    const clearSelections = vi.fn();

    await expect(
      requestEncryptionSectionChange({
        hasEncryptedVariable: true,
        nextOpen: false,
        confirmClear: async () => true,
        clearSelections,
      }),
    ).resolves.toBe(true);
    expect(clearSelections).toHaveBeenCalledOnce();
  });
});
