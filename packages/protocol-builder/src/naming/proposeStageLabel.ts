import type {
  Codebook,
  Item,
  Panel,
  StageSubject,
  StageType,
  Variable,
  Variables,
} from '@codaco/protocol-validation';

import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
import { generateStageLabel, STAGE_TYPE_NAMES } from './generateStageLabel.ts';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts.ts';

/**
 * The only part of a panel a proposed name reads — a slice of the schema's own
 * `Panel`, so a panel assembled anywhere is already one of these.
 */
export type StageLabelPanel = Pick<Panel, 'dataSource'>;

/**
 * The stage being named, as a proposal reads it: the DRAFT, not the stored
 * document, because a name is proposed while the stage is still being
 * configured. Only the keys that contribute to a name, and a stage type with
 * no use for one leaves it out.
 */
export type StageLabelDraft = Readonly<{
  /**
   * The stage this name is for, excluded from the names already taken; omit
   * for a stage that does not exist yet. A stage already in the protocol must
   * name itself here or every proposal collides with its own last accepted
   * name and comes back suffixed ` #2`.
   */
  id?: string | undefined;
  type: StageType;
  subject?: StageSubject | undefined;
  items?: readonly Item[] | undefined;
  nominationPrompts?: readonly Readonly<{ variable: string }>[] | undefined;
  panels?: readonly StageLabelPanel[] | undefined;
}>;

/**
 * What this stage would be called if nobody had named it.
 *
 * Pure, and callable without mounting anything, so a timeline, a create flow
 * and `useAutoStageName` all get the same answer. Whether the proposal is
 * WRITTEN is `useAutoStageName`'s and is deliberately not here.
 *
 * Always answers with a name, and always in English: it seeds a STORED value
 * rather than being copy — see `STAGE_TYPE_NAMES` in `generateStageLabel.ts`.
 */
export function proposeStageLabel(
  stage: StageLabelDraft,
  context: ProtocolBuilderProtocolContext,
): string {
  const subjectName = resolveStageSubjectName(stage.subject, (entity, type) =>
    entityName(context.codebook, entity, type),
  );
  const variablesById = allVariablesById(context.codebook);
  const qualifier = resolveStageQualifier(
    {
      type: stage.type,
      ...(stage.panels === undefined ? {} : { panels: [...stage.panels] }),
      ...(stage.items === undefined ? {} : { items: [...stage.items] }),
      ...(stage.nominationPrompts === undefined
        ? {}
        : { nominationPrompts: [...stage.nominationPrompts] }),
    },
    {
      resolveAssetType: (assetId) => context.assets[assetId]?.type ?? null,
      resolveVariableName: (variableId) =>
        variablesById[variableId]?.name ?? null,
    },
  );
  return generateStageLabel({
    typeName: STAGE_TYPE_NAMES[stage.type],
    subjectName,
    qualifier,
    existingLabels: existingStageLabels(context, stage.id),
  });
}

function entityName(
  codebook: Readonly<Codebook>,
  entity: 'node' | 'edge',
  type: string,
): string | null {
  const types = entity === 'node' ? codebook.node : codebook.edge;
  return types?.[type]?.name ?? null;
}

/**
 * Every attribute in the codebook by its record key: a nomination prompt names
 * one by key alone, so the lookup cannot be scoped to one entity.
 */
function allVariablesById(
  codebook: Readonly<Codebook>,
): Readonly<Record<string, Variable>> {
  const flattened: Record<string, Variable> = {};
  const add = (variables: Readonly<Variables> | undefined) => {
    for (const [id, variable] of Object.entries(variables ?? {})) {
      flattened[id] = variable;
    }
  };
  for (const definition of Object.values(codebook.node ?? {})) {
    add(definition.variables);
  }
  for (const definition of Object.values(codebook.edge ?? {})) {
    add(definition.variables);
  }
  add(codebook.ego?.variables);
  return flattened;
}

/** The names already taken, so a proposal is unique in the interview. */
function existingStageLabels(
  context: ProtocolBuilderProtocolContext,
  stageId: string | undefined,
): string[] {
  return context.orderedStages
    .filter((stage) => stage.id !== stageId)
    .map((stage) => stage.label)
    .filter((label) => label !== '');
}
