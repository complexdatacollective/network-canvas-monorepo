import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { z } from 'zod';

import {
  loadNetcanvasArchive,
  messageText,
  resolveLocalizedString,
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

// A stage label is plain text up to schema 8 and a locale-keyed map of ICU
// messages from schema 9, which also declares the protocol's `localization`.
const stageLabelSchema = z.union([
  z.string().trim().min(1),
  z.record(z.string(), z.string()),
]);

const localizationSchema = z.looseObject({
  defaultLocale: z.string(),
  locales: z.array(z.string()),
});

const protocolSummarySchema = z.looseObject({
  schemaVersion: z.number().int().positive(),
  localization: localizationSchema.optional(),
  stages: z
    .array(
      z.looseObject({
        type: z.custom<StageType>(
          (value) => typeof value === 'string' && stageTypes.has(value),
          'unknown stage type',
        ),
        label: stageLabelSchema,
      }),
    )
    .min(1),
});

// The gallery's own pages are not an interview, so there is no participant
// language to honour: a localized label is shown in the protocol's default
// language.
function resolveStageLabel(
  label: z.infer<typeof stageLabelSchema>,
  localization: z.infer<typeof localizationSchema> | undefined,
  index: number,
): string {
  if (typeof label === 'string') return label;
  if (!localization) {
    throw new Error(
      `protocol.json: stages.${index}.label: a localized label needs the protocol's localization`,
    );
  }
  const resolved = messageText(
    resolveLocalizedString(label, localization, [localization.defaultLocale])
      .text,
  );
  if (resolved.trim() === '') {
    throw new Error(`protocol.json: stages.${index}.label: label is empty`);
  }
  return resolved;
}

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
      stages: parsed.data.stages.map(({ type, label }, index) => ({
        type,
        label: resolveStageLabel(
          label,
          parsed.data.localization,
          index,
        ).replace(/\s+/g, ' '),
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable';
    throw new Error(`${name}: ${message}`, { cause: error });
  }
}
