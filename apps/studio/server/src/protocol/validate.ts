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
  stages: z
    .array(z.string().min(1))
    .refine((stages) => new Set(stages).size === stages.length, {
      message: 'stage order lists the same stage twice',
    }),
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

function validateStageOrderMembership(
  doc: SectionDoc,
  sectionIds: string[],
): SectionValidationResult {
  const order = doc.stages;
  if (!Array.isArray(order)) return { success: true };
  const inOrder = new Set(order.filter((id) => typeof id === 'string'));
  const inManifest = new Set<string>();
  for (const id of sectionIds) {
    const ref = parseSectionId(id);
    if (ref.kind === 'stage') inManifest.add(ref.stageId);
  }
  const issues: SectionIssue[] = [];
  for (const stageId of inOrder) {
    if (!inManifest.has(stageId)) {
      issues.push({
        path: ['stages'],
        message: `stage order names ${stageId}, which the draft has no section for`,
      });
    }
  }
  for (const stageId of inManifest) {
    if (!inOrder.has(stageId)) {
      issues.push({
        path: ['stages'],
        message: `stage ${stageId} is missing from the stage order`,
      });
    }
  }
  return issues.length > 0 ? { success: false, issues } : { success: true };
}

export function assertSectionValid(
  id: string,
  doc: SectionDoc,
  sectionIds?: string[],
): void {
  const fail = (result: SectionValidationResult) => {
    if (!result.success) {
      throw new SectionValidationFailedError([
        { sectionId: id, issues: result.issues },
      ]);
    }
  };
  fail(validateSection(id, doc));
  const ref = parseSectionId(id);
  if (ref.kind === 'stage') {
    fail(validateStageSectionIdentity(ref.stageId, doc));
  }
  if (ref.kind === 'stageOrder' && sectionIds !== undefined) {
    fail(validateStageOrderMembership(doc, sectionIds));
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
