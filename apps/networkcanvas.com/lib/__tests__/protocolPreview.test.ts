import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { loadProtocolGallery } from '~/lib/protocolGallery';
import {
  createPreviewPayload,
  installPreviewProtocol,
} from '~/lib/protocolPreview';

const assetDirectory = join(
  process.cwd(),
  'public',
  'protocols',
  'protocol-gallery',
);

const sourceStagesSchema = z.object({
  stages: z.array(
    z.object({
      type: z.string(),
      introductionPanel: z.unknown().optional(),
      prompts: z
        .array(
          z.object({
            layout: z
              .object({ layoutVariable: z.string().optional() })
              .optional(),
          }),
        )
        .optional(),
    }),
  ),
});

type SourceStage = z.infer<typeof sourceStagesSchema>['stages'][number];

/**
 * How many stages a schema 8 stage becomes: a Sociogram becomes one for each
 * run of prompts that share a layout variable, and a prompt naming none stays
 * in the run before it.
 */
const stageCount = ({ type, prompts = [] }: SourceStage) => {
  if (type !== 'Sociogram') return 1;
  let runs = 0;
  let current: string | undefined;
  for (const prompt of prompts) {
    const layout = prompt.layout?.layoutVariable;
    if (
      runs > 0 &&
      (layout === undefined || current === undefined || layout === current)
    ) {
      current ??= layout;
      continue;
    }
    runs += 1;
    current = layout;
  }
  return Math.max(runs, 1);
};

/**
 * The stage types a schema 8 protocol has once migrated: an Information stage
 * before each stage other than an Ego Form that had an introduction panel,
 * each Sociogram split by layout, and the finish stage the migration appends.
 */
const migratedStageTypes = (stages: readonly SourceStage[]) => {
  const types = stages.flatMap((stage) => [
    ...(stage.introductionPanel !== undefined && stage.type !== 'EgoForm'
      ? ['Information']
      : []),
    ...Array.from({ length: stageCount(stage) }, () => stage.type),
  ]);
  return types.at(-1) === 'FinishSession' ? types : [...types, 'FinishSession'];
};

async function readSourceStages(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const json = await zip.file('protocol.json')?.async('string');
  if (json === undefined) throw new Error('archive has no protocol.json');
  return sourceStagesSchema.parse(JSON.parse(json)).stages;
}

describe('installPreviewProtocol', () => {
  it('installs every shipped gallery protocol at the Shell schema version', async () => {
    const protocols = await loadProtocolGallery();

    for (const protocol of protocols) {
      for (const download of protocol.downloads) {
        const bytes = new Uint8Array(
          await readFile(join(assetDirectory, download.protocolFilename)),
        );
        const result = await installPreviewProtocol(
          bytes,
          download.protocolFilename,
        );

        expect(result.ok, download.protocolFilename).toBe(true);
        if (!result.ok) continue;

        const { install } = result;
        expect(install.protocol.schemaVersion).toBe(
          COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        );
        const downloadTypes = download.stages.map(({ type }) => type);
        const sourceStages = await readSourceStages(bytes);
        expect(sourceStages.map(({ type }) => type)).toEqual(downloadTypes);
        expect(install.protocol.stages.map(({ type }) => type)).toEqual(
          migratedStageTypes(sourceStages),
        );
        expect(install.protocol.hash).toMatch(/\S/);
        expect(install.protocol.assets.map(({ assetId }) => assetId)).toEqual(
          Array.from(install.assets.keys()),
        );
        for (const asset of install.protocol.assets) {
          const data = install.assets.get(asset.assetId);
          if (asset.type === 'apikey') {
            expect(typeof data).toBe('string');
          } else {
            expect(data).toBeInstanceOf(Blob);
          }
        }
      }
    }
  });

  it('installs a Sociogram whose prompts use two layout variables as two stages', async () => {
    const layoutVariable = (name: string) => ({ name, type: 'layout' });
    const prompt = (id: string, layout: string | undefined) => ({
      id,
      text: `Place people (${id})`,
      ...(layout === undefined ? {} : { layout: { layoutVariable: layout } }),
    });
    const source = {
      schemaVersion: 8,
      name: 'Two maps',
      description: '',
      lastModified: '2026-01-01T00:00:00.000Z',
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            shape: { default: 'circle' },
            variables: {
              name: { name: 'name', type: 'text' },
              near: layoutVariable('near'),
              far: layoutVariable('far'),
            },
          },
        },
      },
      stages: [
        {
          id: 'map',
          type: 'Sociogram',
          label: 'Map',
          introductionPanel: { title: 'Maps', text: 'Place people twice.' },
          subject: { entity: 'node', type: 'person' },
          background: { concentricCircles: 4 },
          prompts: [
            prompt('first', 'near'),
            prompt('second', undefined),
            prompt('third', 'far'),
          ],
        },
      ],
    };
    const zip = new JSZip();
    zip.file('protocol.json', JSON.stringify(source));
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const result = await installPreviewProtocol(bytes, 'two-maps.netcanvas');
    if (!result.ok) throw new Error(result.reason);

    const sourceStages = await readSourceStages(bytes);
    expect(migratedStageTypes(sourceStages)).toEqual([
      'Information',
      'Sociogram',
      'Sociogram',
      'FinishSession',
    ]);
    expect(result.install.protocol.stages.map(({ type }) => type)).toEqual(
      migratedStageTypes(sourceStages),
    );
  });

  it('starts a fresh session for each preview run', async () => {
    const [protocol] = await loadProtocolGallery();
    const download = protocol?.downloads[0];
    if (!download) throw new Error('gallery has no protocols');

    const result = await installPreviewProtocol(
      new Uint8Array(
        await readFile(join(assetDirectory, download.protocolFilename)),
      ),
      download.protocolFilename,
    );
    if (!result.ok) throw new Error(result.reason);

    const first = createPreviewPayload(result.install);
    const second = createPreviewPayload(result.install);

    expect(first.protocol).toBe(second.protocol);
    expect(first.session.id).not.toBe(second.session.id);
    expect(first.session.finishTime).toBeNull();
    expect(first.session.network.ego).toBeDefined();
    expect(first.session).not.toHaveProperty('localePreference');
    expect(first.session).not.toHaveProperty('locale');
    expect(first.session.localeOptions.map(({ locale }) => locale)).toEqual(
      first.protocol.localization.locales,
    );
  });

  it('reports a protocol from a newer version as an unsupported version', async () => {
    const zip = new JSZip();
    zip.file(
      'protocol.json',
      JSON.stringify({
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION + 1,
        name: 'From the future',
      }),
    );
    const result = await installPreviewProtocol(
      await zip.generateAsync({ type: 'uint8array' }),
      'future.netcanvas',
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported-version' });
  });

  it('reports bytes that are not an archive as unreadable', async () => {
    const result = await installPreviewProtocol(
      new TextEncoder().encode('not a zip'),
      'broken.netcanvas',
    );
    expect(result).toEqual({ ok: false, reason: 'unreadable' });
  });
});
