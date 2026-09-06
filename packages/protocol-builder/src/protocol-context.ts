import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import {
  type Asset,
  assetSchema,
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

/**
 * What is wrong with a protocol section this package could not read.
 *
 * `ProtocolContextIssue.message` is a plain string because the same field also
 * carries the protocol schema's own wording for a section that failed
 * validation. The messages THIS module writes are encoded into it with
 * `createMessageError` and decoded where they are rendered
 * (`formatMessageError(text, intl) ?? text`), so a schema message passes
 * through unchanged.
 */
const messages = defineMessages({
  stageOrderNotList: {
    id: 'protocolBuilder.protocolContext.stageOrderNotList',
    defaultMessage: 'Stage order must be a list of non-empty stage ids.',
    description:
      'Why the order of the interview steps could not be read. "stage" is one step of an interview.',
  },
  stageOrderDuplicate: {
    id: 'protocolBuilder.protocolContext.stageOrderDuplicate',
    defaultMessage: 'Stage order must not list the same stage twice.',
    description:
      'Why the order of the interview steps could not be read: one step appears in it more than once. "stage" is one step of an interview.',
  },
  variableIdReused: {
    id: 'protocolBuilder.protocolContext.variableIdReused',
    defaultMessage:
      'Attribute record key "{variableId}" is reused across entity types (first declared in {firstOwnerSectionId}).',
    description:
      'Why part of the codebook could not be read: two entity types store an attribute under the same key. variableId is the key; firstOwnerSectionId identifies the part of the protocol that used it first.',
  },
  duplicateEntityName: {
    id: 'protocolBuilder.protocolContext.duplicateEntityName',
    defaultMessage:
      'Duplicate entity name "{name}" (first declared in {firstOwnerSectionId}).',
    description:
      'Why part of the codebook could not be read: two entity types share a name. name is the researcher-authored type name; firstOwnerSectionId identifies the part of the protocol that used it first.',
  },
  unknownSectionId: {
    id: 'protocolBuilder.protocolContext.unknownSectionId',
    defaultMessage: 'Unknown protocol section id.',
    description:
      'Why part of the protocol could not be read: it is filed under a name this version does not recognise.',
  },
  stageIdMismatch: {
    id: 'protocolBuilder.protocolContext.stageIdMismatch',
    defaultMessage:
      'Stage document id {documentId} does not match section id {sectionStageId}.',
    description:
      'Why one interview step could not be read: the identifier inside it disagrees with the one it is filed under. "stage" is one step of an interview.',
  },
  missingStageOrder: {
    id: 'protocolBuilder.protocolContext.missingStageOrder',
    defaultMessage: 'Protocol sections do not include a stage order.',
    description:
      'Why the interview steps could not be put in order: the protocol has nothing saying what the order is.',
  },
  stageOrderMissingStage: {
    id: 'protocolBuilder.protocolContext.stageOrderMissingStage',
    defaultMessage: 'Stage order names missing stage {stageId}.',
    description:
      'Why the order of the interview steps could not be used: it names a step the protocol does not have. "stage" is one step of an interview.',
  },
  stageMissingFromOrder: {
    id: 'protocolBuilder.protocolContext.stageMissingFromOrder',
    defaultMessage: 'Stage {stageId} is missing from the stage order.',
    description:
      'Why one interview step is not shown: the protocol has it but the order does not name it. "stage" is one step of an interview.',
  },
});

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
  /**
   * The protocol's asset manifest, keyed by asset id.
   *
   * Metadata only, and deliberately so: a stage editor needs to know what KIND
   * of thing an asset reference points at (a name reads "with Image & Video",
   * a roster data source has to be a network) without any of the bytes. Where
   * the file itself lives is the host's business.
   */
  assets: Readonly<Record<string, Asset>>;
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
      message: createMessageError(messages.stageOrderNotList),
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
      message: createMessageError(messages.stageOrderDuplicate),
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
  const assets = new Map<string, Asset>();
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
          message: createMessageError(messages.variableIdReused, {
            variableId,
            firstOwnerSectionId,
          }),
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
        message: createMessageError(messages.duplicateEntityName, {
          name,
          firstOwnerSectionId,
        }),
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
            : createMessageError(messages.unknownSectionId),
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
            message: createMessageError(messages.stageIdMismatch, {
              documentId: result.data.id,
              sectionStageId: ref.stageId,
            }),
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
      case 'assets': {
        // The assets section IS the manifest — one entry per asset, keyed by
        // id. Each is parsed on its own so one malformed entry is reported
        // rather than costing the section every other asset's metadata.
        for (const [assetId, entry] of Object.entries(document)) {
          const result = assetSchema.safeParse(entry);
          if (result.success) {
            assets.set(assetId, result.data);
          } else {
            issues.push(
              ...sectionIssues(id, result.error.issues).map((issue) => ({
                ...issue,
                path: [assetId, ...issue.path],
              })),
            );
          }
        }
        break;
      }
      case 'settings':
        break;
    }
  }

  const orderSectionId = sectionId({ kind: 'stageOrder' });
  if (stageOrder === null && sections[orderSectionId] === undefined) {
    issues.push({
      sectionId: orderSectionId,
      path: [],
      message: createMessageError(messages.missingStageOrder),
    });
  }

  const orderedStages: Stage[] = [];
  for (const stageId of stageOrder ?? []) {
    const stage = stages.get(stageId);
    if (stage === undefined) {
      issues.push({
        sectionId: orderSectionId,
        path: ['stages'],
        message: createMessageError(messages.stageOrderMissingStage, {
          stageId,
        }),
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
      message: createMessageError(messages.stageMissingFromOrder, { stageId }),
    });
  }

  const codebook: Codebook = {
    node: Object.freeze(Object.fromEntries(node)),
    edge: Object.freeze(Object.fromEntries(edge)),
    ...(ego === undefined ? {} : { ego }),
  };

  return Object.freeze({
    codebook: Object.freeze(codebook),
    assets: Object.freeze(Object.fromEntries(assets)),
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
