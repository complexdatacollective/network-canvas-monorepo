import { z } from 'zod';

// Per-section only. Cross-section invariants belong to the assembled document,
// which validateDraft and the publish gate check with the canonical validator.
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

/** @public */
export const SettingsSectionSchema = z.strictObject({
  name: z.string().min(1),
  description: z.string().optional(),
  experiments: ExperimentsSchema.optional(),
  lastModified: z.string().datetime().optional(),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
});

/** @public */
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

export function assertSectionValid(id: string, doc: SectionDoc): void {
  const result = validateSection(id, doc);
  if (!result.success) {
    throw new SectionValidationFailedError([
      { sectionId: id, issues: result.issues },
    ]);
  }
  const ref = parseSectionId(id);
  if (ref.kind !== 'stage') return;
  const identity = validateStageSectionIdentity(ref.stageId, doc);
  if (!identity.success) {
    throw new SectionValidationFailedError([
      { sectionId: id, issues: identity.issues },
    ]);
  }
}

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
