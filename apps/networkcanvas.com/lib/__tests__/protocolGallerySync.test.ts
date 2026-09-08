import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatCsvTable, parseCsvTable } from '~/lib/csvTable';
import { SYNC_COMMAND } from '~/lib/protocolGalleryColumns';
import { syncProtocolGallery } from '~/lib/protocolGallerySync';

const contentFile = join(process.cwd(), 'content', 'protocol-gallery.csv');
const assetDirectory = join(
  process.cwd(),
  'public',
  'protocols',
  'protocol-gallery',
);

const derivedHeader = [
  'Waves',
  'Schema Version Wave 1',
  'Schema Version Wave 2',
  'Stage Count Wave 1',
  'Stage Count Wave 2',
  'Edge Stages Wave 1',
  'Edge Stages Wave 2',
  'Stages Wave 1',
  'Stages Wave 2',
];

describe('syncProtocolGallery', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'networkcanvas-sync-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('matches the checked-in dataset (the derived columns are not stale)', async () => {
    expect(
      await syncProtocolGallery(contentFile, assetDirectory),
      `content/protocol-gallery.csv is stale relative to the .netcanvas assets; run ${SYNC_COMMAND}`,
    ).toBe(await readFile(contentFile, 'utf8'));
  });

  it('is idempotent', async () => {
    const synced = join(directory, 'protocol-gallery.csv');
    await writeFile(
      synced,
      await syncProtocolGallery(contentFile, assetDirectory),
    );

    expect(await syncProtocolGallery(synced, assetDirectory)).toBe(
      await readFile(synced, 'utf8'),
    );
  });

  it('keeps authored cells byte for byte, discovers waves from the header and rewrites every derived column after the authored ones', async () => {
    const file = join(directory, 'protocol-gallery.csv');
    await writeFile(
      file,
      formatCsvTable([
        [
          'Slug',
          'Stages Wave 9',
          'Protocol File (asset)',
          'Waves',
          'Protocol File (asset) Wave 2',
          'Codebook Summary (asset) Wave 2',
          'Notes',
        ],
        [
          'sixhumene',
          'stale',
          ' SIXHUMENE-Wave1_10-22-2025.netcanvas ',
          'stale',
          'SIXHUMENE-Wave2_10-22-2025.netcanvas',
          '',
          'a "quoted",\nmulti-line note ',
        ],
        ['kaya', '', 'KAYA_10-22-2025.netcanvas', '', '', '', ''],
      ]),
    );

    const [header, sixhumene, kaya] = await parseCsvTable(
      await syncProtocolGallery(file, assetDirectory),
    );

    expect(header).toEqual([
      'Slug',
      'Protocol File (asset)',
      'Protocol File (asset) Wave 2',
      'Codebook Summary (asset) Wave 2',
      'Notes',
      ...derivedHeader,
    ]);
    expect(sixhumene?.slice(0, 5)).toEqual([
      'sixhumene',
      ' SIXHUMENE-Wave1_10-22-2025.netcanvas ',
      'SIXHUMENE-Wave2_10-22-2025.netcanvas',
      '',
      'a "quoted",\nmulti-line note ',
    ]);
    expect(sixhumene?.slice(5, 12)).toEqual([
      '2',
      '7',
      '7',
      '32',
      '28',
      'Sociogram=1',
      'Sociogram=1',
    ]);
    expect(JSON.parse(sixhumene?.[12] ?? '')).toHaveLength(32);
    expect(JSON.parse(sixhumene?.[13] ?? '')).toHaveLength(28);
    expect(kaya?.slice(5)).toEqual([
      '1',
      '7',
      '',
      '16',
      '',
      '',
      '',
      expect.stringMatching(/^\[\{"type":"Information","label":/),
      '',
    ]);
  });

  it('names the row and column when a protocol archive cannot be read', async () => {
    const file = join(directory, 'protocol-gallery.csv');
    await writeFile(
      file,
      formatCsvTable([
        ['Slug', 'Protocol File (asset)', 'Protocol File (asset) Wave 2'],
        ['kaya', 'KAYA_10-22-2025.netcanvas', ''],
        ['absent', 'KAYA_10-22-2025.netcanvas', 'absent.netcanvas'],
      ]),
    );

    await expect(syncProtocolGallery(file, assetDirectory)).rejects.toThrow(
      /^protocol-gallery\.csv: row 3: Protocol File \(asset\) Wave 2: absent\.netcanvas: /,
    );
  });
});
