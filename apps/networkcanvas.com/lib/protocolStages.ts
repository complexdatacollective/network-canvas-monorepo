import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { z } from 'zod';

import {
  loadNetcanvasArchive,
  stageSchema,
  type StageType,
} from '@codaco/protocol-validation';

export type ProtocolStage = {
  type: StageType;
  label: string;
};

export type ProtocolArchiveSummary = {
  schemaVersion: number;
  stages: ProtocolStage[];
};

const stageTypes = new Set<string>(
  stageSchema.options.map((option) => option.shape.type.value),
);

const protocolSummarySchema = z.looseObject({
  schemaVersion: z.number().int().positive(),
  stages: z
    .array(
      z.looseObject({
        type: z.custom<StageType>(
          (value) => typeof value === 'string' && stageTypes.has(value),
          'unknown stage type',
        ),
        label: z.string().trim().min(1),
      }),
    )
    .min(1),
});

export async function readProtocolArchive(
  file: string,
): Promise<ProtocolArchiveSummary> {
  const name = basename(file);

  try {
    const zip = await loadNetcanvasArchive(await readFile(file));
    const entry = zip.file('protocol.json');
    if (!entry) throw new Error('protocol.json missing');

    const parsed = protocolSummarySchema.safeParse(
      JSON.parse(await entry.async('string')),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `protocol.json: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}`,
      );
    }

    return {
      schemaVersion: parsed.data.schemaVersion,
      stages: parsed.data.stages.map(({ type, label }) => ({
        type,
        label: label.replace(/\s+/g, ' '),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable';
    throw new Error(`${name}: ${message}`, { cause: error });
  }
}
