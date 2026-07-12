import { describe, expect, it } from 'vitest';

import {
  classicApps,
  compatibilityWarning,
  GET_STARTED_PATH,
  webApps,
} from '../getStarted';

describe('get started content', () => {
  it('uses the Get Started route', () => {
    expect(GET_STARTED_PATH).toBe('/get-started');
  });

  it('defines the current web apps in workflow order', () => {
    expect(webApps.map(({ id }) => id)).toEqual([
      'architect',
      'interviewer',
      'fresco',
    ]);
  });

  it('recommends Fresco for large teams or remote administration', () => {
    expect(webApps.find(({ id }) => id === 'fresco')?.status).toBe(
      'Large Teams · Remote Administration · Recommended',
    );
  });

  it('defines both Classic apps at version 6.6.0', () => {
    expect(classicApps.map(({ id }) => id)).toEqual([
      'architect-classic',
      'interviewer-classic',
    ]);
    expect(classicApps.every(({ version }) => version === '6.6.0')).toBe(true);
  });

  it('provides every supported platform for each Classic app', () => {
    expect(
      classicApps.every(({ platforms }) =>
        ['apple-silicon', 'apple-intel', 'windows', 'linux'].every((platform) =>
          platforms.some(({ id }) => id === platform),
        ),
      ),
    ).toBe(true);
  });

  it('does not include the retired Server app', () => {
    expect(
      JSON.stringify({ webApps, classicApps, compatibilityWarning }),
    ).not.toMatch(
      /Network Canvas Server|Network-Canvas-Server|\/Server\/releases/i,
    );
  });
});
