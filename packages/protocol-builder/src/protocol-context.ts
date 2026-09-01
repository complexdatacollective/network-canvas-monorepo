import {
  type Codebook,
  EdgeDefinitionSchema,
  type EdgeDefinition,
  EgoDefinitionSchema,
  type EgoDefinition,
  NodeDefinitionSchema,
  type NodeDefinition,
  type Stage,
  stageSchema,
  type Variable,
  type Variables,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

export type CodebookSubject =
  | Readonly<{ entity: 'node'; type: string }>
  | Readonly<{ entity: 'edge'; type: string }>
  | Readonly<{ entity: 'ego' }>;

export type ProtocolContextIssue = Readonly<{
  sectionId: string;
  path: readonly (string | number)[];
  message: string;
}>;

/**
 * The individually validated protocol sections stage editors may safely read.
 *
 * This is deliberately not a `CurrentProtocol`. Cross-section references may
 * be invalid while collaborators work (for example, just after a referenced
 * variable is deleted), but the remaining entity metadata and stage order are
 * still useful and must stay readable.
 */
export type ProtocolBuilderProtocolContext = Readonly<{
  codebook: Readonly<Codebook>;
  orderedStages: readonly Readonly<Stage>[];
  issues: readonly ProtocolContextIssue[];
}>;

const EMPTY_VARIABLES: Readonly<Variables> = Object.freeze({});

const sectionIssues = (
  id: string,
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): ProtocolContextIssue[] =>
  issues.map((issue) => ({
    sectionId: id,
    path: issue.path.map((part) =>
      typeof part === 'symbol' ? String(part) : part,
    ),
    message: issue.message,
  }));

const stageOrderFrom = (
  id: string,
  document: SectionDoc,
  issues: ProtocolContextIssue[],
): string[] | null => {
  const stages = document.stages;
  if (
    !Array.isArray(stages) ||
    stages.some((stageId) => typeof stageId !== 'string' || stageId === '')
  ) {
    issues.push({
      sectionId: id,
      path: ['stages'],
      message: 'Stage order must be a list of non-empty stage ids.',
    });
    return null;
  }

  const order = stages.filter(
    (stageId): stageId is string => typeof stageId === 'string',
  );
  if (new Set(order).size !== order.length) {
    issues.push({
      sectionId: id,
      path: ['stages'],
      message: 'Stage order must not list the same stage twice.',
    });
    return null;
  }
  return [...order];
};

/**
 * Builds the package-owned, host-neutral codebook and ordered-stage read model.
 * Malformed sections are reported and omitted instead of making every
 * accessor throw; the host's canonical whole-document validation remains the
 * authority on whether the draft may be finished or published.
 */
export function protocolContextFromSections(
  sections: Readonly<Record<string, SectionDoc>>,
): ProtocolBuilderProtocolContext {
  const issues: ProtocolContextIssue[] = [];
  const node = new Map<string, NodeDefinition>();
  const edge = new Map<string, EdgeDefinition>();
  const stages = new Map<string, Stage>();
  const variableOwners = new Map<string, string>();
  const entityNameOwners = new Map<string, string>();
  let ego: EgoDefinition | undefined;
  let stageOrder: string[] | null = null;

  const recordVariableIds = (
    ownerSectionId: string,
    variables: Readonly<Variables> | undefined,
  ) => {
    for (const variableId of Object.keys(variables ?? {})) {
      const firstOwnerSectionId = variableOwners.get(variableId);
      if (firstOwnerSectionId !== undefined) {
        issues.push({
          sectionId: ownerSectionId,
          path: ['variables', variableId],
          message: `Attribute record key "${variableId}" is reused across entity types (first declared in ${firstOwnerSectionId}).`,
        });
        continue;
      }
      variableOwners.set(variableId, ownerSectionId);
    }
  };

  const recordEntityName = (ownerSectionId: string, name: string) => {
    const firstOwnerSectionId = entityNameOwners.get(name);
    if (firstOwnerSectionId !== undefined) {
      issues.push({
        sectionId: ownerSectionId,
        path: ['name'],
        message: `Duplicate entity name "${name}" (first declared in ${firstOwnerSectionId}).`,
      });
      return;
    }
    entityNameOwners.set(name, ownerSectionId);
  };

  for (const [id, document] of Object.entries(sections)) {
    let ref: ReturnType<typeof parseSectionId>;
    try {
      ref = parseSectionId(id);
    } catch (error) {
      issues.push({
        sectionId: id,
        path: [],
        message:
          error instanceof Error && error.message !== ''
            ? error.message
            : 'Unknown protocol section id.',
      });
      continue;
    }

    switch (ref.kind) {
      case 'stageOrder': {
        stageOrder = stageOrderFrom(id, document, issues);
        break;
      }
      case 'stage': {
        const result = stageSchema.safeParse(document);
        if (!result.success) {
          issues.push(...sectionIssues(id, result.error.issues));
          break;
        }
        if (result.data.id !== ref.stageId) {
          issues.push({
            sectionId: id,
            path: ['id'],
            message: `Stage document id ${result.data.id} does not match section id ${ref.stageId}.`,
          });
          break;
        }
        stages.set(ref.stageId, result.data);
        break;
      }
      case 'codebookNode': {
        const result = NodeDefinitionSchema.safeParse(document);
        if (result.success) {
          node.set(ref.typeId, result.data);
          recordEntityName(id, result.data.name);
          recordVariableIds(id, result.data.variables);
        } else issues.push(...sectionIssues(id, result.error.issues));
        break;
      }
      case 'codebookEdge': {
        const result = EdgeDefinitionSchema.safeParse(document);
        if (result.success) {
          edge.set(ref.typeId, result.data);
          recordEntityName(id, result.data.name);
          recordVariableIds(id, result.data.variables);
        } else issues.push(...sectionIssues(id, result.error.issues));
        break;
      }
      case 'codebookEgo': {
        const result = EgoDefinitionSchema.safeParse(document);
        if (result.success) {
          ego = result.data;
          recordVariableIds(id, result.data.variables);
        } else issues.push(...sectionIssues(id, result.error.issues));
        break;
      }
      case 'settings':
      case 'assets':
        break;
    }
  }

  const orderSectionId = sectionId({ kind: 'stageOrder' });
  if (stageOrder === null && sections[orderSectionId] === undefined) {
    issues.push({
      sectionId: orderSectionId,
      path: [],
      message: 'Protocol sections do not include a stage order.',
    });
  }

  const orderedStages: Stage[] = [];
  for (const stageId of stageOrder ?? []) {
    const stage = stages.get(stageId);
    if (stage === undefined) {
      issues.push({
        sectionId: orderSectionId,
        path: ['stages'],
        message: `Stage order names missing stage ${stageId}.`,
      });
      continue;
    }
    orderedStages.push(stage);
    stages.delete(stageId);
  }
  for (const stageId of stages.keys()) {
    issues.push({
      sectionId: sectionId({ kind: 'stage', stageId }),
      path: ['id'],
      message: `Stage ${stageId} is missing from the stage order.`,
    });
  }

  const codebook: Codebook = {
    node: Object.freeze(Object.fromEntries(node)),
    edge: Object.freeze(Object.fromEntries(edge)),
    ...(ego === undefined ? {} : { ego }),
  };

  return Object.freeze({
    codebook: Object.freeze(codebook),
    orderedStages: Object.freeze(orderedStages),
    issues: Object.freeze(issues),
  });
}

export function entityForSubject(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
): Readonly<NodeDefinition | EdgeDefinition | EgoDefinition> | undefined {
  if (subject.entity === 'ego') return context.codebook.ego;
  return context.codebook[subject.entity]?.[subject.type];
}

export function variablesForSubject(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
): Readonly<Variables> {
  return entityForSubject(context, subject)?.variables ?? EMPTY_VARIABLES;
}

export function variableForSubject(
  context: ProtocolBuilderProtocolContext,
  subject: CodebookSubject,
  variableId: string,
): Readonly<Variable> | undefined {
  return variablesForSubject(context, subject)[variableId];
}
