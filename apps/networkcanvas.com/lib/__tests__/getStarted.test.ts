import { describe, expect, it } from 'vitest';

import { classicApps } from '~/test/classicApps';

import { GET_STARTED_PATH, webApps } from '../getStarted';

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

  it('derives both Classic apps from release metadata', () => {
    expect(classicApps.map(({ id }) => id)).toEqual([
      'architect-classic',
      'interviewer-classic',
    ]);
    expect(classicApps.every(({ version }) => version === '6.6.0')).toBe(true);

    expect(classicApps[0]?.platforms.map(({ href }) => href)).toEqual([
      '/downloads/classic/architect/6.6.0/apple-silicon',
      '/downloads/classic/architect/6.6.0/apple-intel',
      '/downloads/classic/architect/6.6.0/windows',
      'https://github.com/complexdatacollective/Architect/releases/latest',
    ]);
    expect(classicApps[1]?.platforms.map(({ href }) => href)).toEqual([
      '/downloads/classic/interviewer/6.6.0/apple-silicon',
      '/downloads/classic/interviewer/6.6.0/apple-intel',
      '/downloads/classic/interviewer/6.6.0/windows',
      'https://github.com/complexdatacollective/Interviewer/releases/latest',
      'https://play.google.com/store/apps/details?id=org.codaco.NetworkCanvasInterviewer6',
    ]);
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
      expect.arrayContaining(['android']),
    );
  });

  it('does not include the retired Server app', () => {
    expect(JSON.stringify({ webApps, classicApps })).not.toMatch(
      /Network Canvas Server|Network-Canvas-Server|\/Server\/releases/i,
    );
  });
});
