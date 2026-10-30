import { describe, expect, it } from 'vitest';

import reducer, {
  getLocalePreference,
  localePreferenceRestored,
  setLocalePreference,
} from '../ui';

const initial = reducer(undefined, { type: '@@init' });
const preference = (state: typeof initial) =>
  getLocalePreference({ ui: state });

describe('the restored language preference', () => {
  it('is the preference the tab kept, which becomes the preference', () => {
    expect(preference(reducer(initial, localePreferenceRestored('es')))).toBe(
      'es',
    );
  });

  it('is nothing when the tab kept nothing, leaving the preference alone', () => {
    const chosen = reducer(initial, setLocalePreference('fr'));
    expect(preference(reducer(chosen, localePreferenceRestored(null)))).toBe(
      'fr',
    );
  });

  it('gives way to a preference stated later', () => {
    const restored = reducer(initial, localePreferenceRestored('es'));
    expect(preference(reducer(restored, setLocalePreference('fr')))).toBe('fr');
  });
});
