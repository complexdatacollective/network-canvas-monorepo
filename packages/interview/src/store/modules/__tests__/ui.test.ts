import { describe, expect, it } from 'vitest';

import reducer, {
  getLocalePreference,
  getRestoredLocalePreference,
  localePreferenceRestored,
  setLocalePreference,
} from '../ui';

const initial = reducer(undefined, { type: '@@init' });
const read = (state: typeof initial) => ({
  preference: getLocalePreference({ ui: state }),
  restored: getRestoredLocalePreference({ ui: state }),
});

describe('the restored language preference', () => {
  it('is the preference the tab kept, which becomes the preference', () => {
    expect(read(reducer(initial, localePreferenceRestored('es')))).toEqual({
      preference: 'es',
      restored: 'es',
    });
  });

  it('is nothing when the tab kept nothing, leaving the preference alone', () => {
    const chosen = reducer(initial, setLocalePreference('fr'));
    expect(read(reducer(chosen, localePreferenceRestored(null)))).toEqual({
      preference: 'fr',
      restored: null,
    });
  });

  it('is forgotten once the preference moves on, so a change back is an ordinary change', () => {
    const restored = reducer(initial, localePreferenceRestored('es'));
    const movedOn = reducer(restored, setLocalePreference('fr'));
    expect(read(movedOn)).toEqual({ preference: 'fr', restored: null });
    expect(read(reducer(movedOn, setLocalePreference('es')))).toEqual({
      preference: 'es',
      restored: null,
    });
  });

  it('is kept when the same preference is stated again', () => {
    const restored = reducer(initial, localePreferenceRestored('es'));
    expect(read(reducer(restored, setLocalePreference('es')))).toEqual({
      preference: 'es',
      restored: 'es',
    });
  });
});
