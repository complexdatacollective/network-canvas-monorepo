import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { z } from 'zod';

import { loadNetcanvasArchive } from '@codaco/protocol-validation';

export type ProtocolStage = {
  type: string;
  label: string;
};

const protocolStagesSchema = z.looseObject({
  stages: z
    .array(
      z.looseObject({
        type: z.string().trim().min(1),
        label: z.string().trim().min(1),
      }),
    )
    .min(1),
});

export async function readProtocolStages(
  file: string,
): Promise<ProtocolStage[]> {
  const name = basename(file);

  try {
    const zip = await loadNetcanvasArchive(await readFile(file));
    const entry = zip.file('protocol.json');
    if (!entry) throw new Error('protocol.json missing');

    const parsed = protocolStagesSchema.safeParse(
      JSON.parse(await entry.async('string')),
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `stages: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'}`,
      );
    }

    return parsed.data.stages.map(({ type, label }) => ({
      type,
      label: label.replace(/\s+/g, ' '),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable';
    throw new Error(`${name}: ${message}`, { cause: error });
  }
}
