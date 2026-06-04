import { describe, expect, it } from 'vitest';

import { excludeSelectedOption } from '../bioTriadOptions';

const options = [
  { value: 'ego', label: 'You' },
  { value: 'partner', label: 'Partner' },
  { value: 'new', label: 'Create a new person' },
];

describe('excludeSelectedOption', () => {
  it('disables the existing option matching the excluded value', () => {
    const result = excludeSelectedOption(options, 'ego');
    expect(result.find((o) => o.value === 'ego')?.disabled).toBe(true);
    expect(result.find((o) => o.value === 'partner')?.disabled).toBeUndefined();
  });

  it('never disables the "new" option, even when it is the excluded value', () => {
    const result = excludeSelectedOption(options, 'new');
    expect(result.find((o) => o.value === 'new')?.disabled).toBeUndefined();
  });

  it('disables nothing when the excluded value is undefined', () => {
    const result = excludeSelectedOption(options, undefined);
    expect(result.every((o) => o.disabled === undefined)).toBe(true);
  });

  it('disables nothing when the excluded value matches no option', () => {
    const result = excludeSelectedOption(options, 'someone-else');
    expect(result.every((o) => o.disabled === undefined)).toBe(true);
  });
});
