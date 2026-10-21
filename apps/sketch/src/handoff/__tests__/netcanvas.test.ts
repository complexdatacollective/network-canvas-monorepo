import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { sampleResult } from '../../__tests__/fixtures.ts';
import { buildNetcanvas, netcanvasFileName } from '../netcanvas.ts';

describe('buildNetcanvas', () => {
  it('writes protocol.json and each asset under assets/<source name>', async () => {
    const { protocol, assets } = sampleResult();
    const zip = await JSZip.loadAsync(await buildNetcanvas(protocol, assets));

    expect(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name]?.dir)
        .toSorted(),
    ).toEqual(['assets/classmates.csv', 'protocol.json']);
    const written: unknown = JSON.parse(
      (await zip.file('protocol.json')?.async('string')) ?? '',
    );
    expect(written).toEqual(protocol);
    expect(await zip.file('assets/classmates.csv')?.async('string')).toBe(
      'name\nAda\n',
    );
  });

  it('writes only protocol.json when there are no assets', async () => {
    const zip = await JSZip.loadAsync(await buildNetcanvas({ name: 'x' }, []));
    expect(Object.keys(zip.files)).toEqual(['protocol.json']);
  });
});

describe('netcanvasFileName', () => {
  it('slugs the protocol name', () => {
    expect(
      netcanvasFileName(
        'Friendship, Drinking & Wellbeing in First-Year Students',
      ),
    ).toBe('friendship-drinking-wellbeing-in-first-year-students.netcanvas');
    expect(netcanvasFileName('Café für Ältere')).toBe(
      'cafe-fur-altere.netcanvas',
    );
  });

  it('falls back when nothing is left', () => {
    expect(netcanvasFileName('???')).toBe('protocol.netcanvas');
  });

  it('keeps names to a manageable length without a trailing dash', () => {
    const name = netcanvasFileName(`${'a'.repeat(59)} b c d`);
    expect(name.length).toBeLessThanOrEqual(60 + '.netcanvas'.length);
    expect(name).not.toMatch(/-\.netcanvas$/);
  });
});
