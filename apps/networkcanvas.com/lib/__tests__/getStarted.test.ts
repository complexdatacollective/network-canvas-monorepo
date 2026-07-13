import { describe, expect, it } from 'vitest';

import { classicApps, GET_STARTED_PATH, webApps } from '../getStarted';

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

    const interviewer = classicApps.find(
      ({ id }) => id === 'interviewer-classic',
    );
    expect(interviewer?.platforms.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['ios', 'android']),
    );
  });

  it('does not include the retired Server app', () => {
    expect(JSON.stringify({ webApps, classicApps })).not.toMatch(
      /Network Canvas Server|Network-Canvas-Server|\/Server\/releases/i,
    );
  });
});
