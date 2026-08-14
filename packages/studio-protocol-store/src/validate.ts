import { z } from 'zod';

// Write-time section validation (#1276): each section document validates
// against @codaco/protocol-validation's modular sub-schema for its kind.
// Cross-section invariants (codebook-wide uniqueness, stage cross-references,
// skip-logic ordering) deliberately do NOT run here — they belong to the
// assembled document, which validateDraft and the publish gate check with the
// canonical validator.
import {
  CURRENT_SCHEMA_VERSION,
  EdgeDefinitionSchema,
  EgoDefinitionSchema,
  ExperimentsSchema,
  NodeDefinitionSchema,
  assetSchema,
  stageSchema,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { parseSectionId } from './taxonomy.ts';

export const SettingsSectionSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  experiments: ExperimentsSchema.optional(),
  lastModified: z.string().datetime().optional(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
});

export const StageOrderSectionSchema = z.strictObject({
  stages: z.array(z.string().min(1)),
});

const AssetsSectionSchema = z.record(z.string(), assetSchema);

export type SectionIssue = {
  path: (string | number)[];
  message: string;
};

export type SectionValidationResult =
  | { success: true }
  | { success: false; issues: SectionIssue[] };

export class SectionValidationFailedError extends Error {
  readonly issues: { sectionId: string; issues: SectionIssue[] }[];
  constructor(issues: { sectionId: string; issues: SectionIssue[] }[]) {
    super(
      `section validation failed: ${issues
        .map((entry) => entry.sectionId)
        .join(', ')}`,
    );
    this.issues = issues;
  }
}

function schemaFor(id: string): z.ZodType {
  const ref = parseSectionId(id);
  switch (ref.kind) {
    case 'settings':
      return SettingsSectionSchema;
    case 'stageOrder':
      return StageOrderSectionSchema;
    case 'stage':
      return stageSchema;
    case 'codebookNode':
      return NodeDefinitionSchema;
    case 'codebookEdge':
      return EdgeDefinitionSchema;
    case 'codebookEgo':
      return EgoDefinitionSchema;
    case 'assets':
      return AssetsSectionSchema;
  }
}

/** Validates one section document against its kind's sub-schema. */
export function validateSection(
  id: string,
  doc: SectionDoc,
): SectionValidationResult {
  const result = schemaFor(id).safeParse(doc);
  if (result.success) return { success: true };
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map((part) =>
        typeof part === 'symbol' ? String(part) : part,
      ),
      message: issue.message,
    })),
  };
}

/** A stage section's id must match the stage document's own id. */
export function validateStageSectionIdentity(
  stageId: string,
  doc: SectionDoc,
): SectionValidationResult {
  if (doc.id !== stageId) {
    return {
      success: false,
      issues: [
        {
          path: ['id'],
          message: `stage document id ${String(doc.id)} does not match section id ${stageId}`,
        },
      ],
    };
  }
  return { success: true };
}
