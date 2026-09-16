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
 * The only part of a panel a proposed name reads.
 *
 * Declared as a slice of the schema's own `Panel` rather than as a shape of
 * its own, so a panel assembled anywhere in the ecosystem is already one of
 * these: what the qualifier reads is where the panel draws its people from,
 * and nothing else about it. See `resolveStageQualifier`.
 */
export type StageLabelPanel = Pick<Panel, 'dataSource'>;

/**
 * The stage being named, as a proposal reads it.
 *
 * Everything here is what the stage would hold if it were saved right now —
 * the draft, not the stored document — because a name is proposed while the
 * researcher is still configuring the stage. Only the keys that contribute to
 * a name are listed, and a stage type that has no use for one simply leaves it
 * out: `resolveStageQualifier` asks about `panels` for the two name generators
 * that have them, about `items` for Information and about `nominationPrompts`
 * for Family Pedigree, and about nothing at all for every other interface.
 */
export type StageLabelDraft = Readonly<{
  /**
   * The stage this name is for, excluded from the names already taken; omit
   * for a stage that does not exist yet.
   *
   * A stage already in the protocol has to name itself here or every proposal
   * collides with its own last accepted name and comes back suffixed ` #2`,
   * then ` #3`. A stage being created has no id to give, and nothing in the
   * interview can be it — so there is nothing to exclude, and a caller should
   * not have to invent an id that matches nothing to say so.
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
 * Pure, and callable without mounting anything: a timeline offering to name a
 * stage, a create flow seeding one before any editor opens, a host writing a
 * name from a menu, and `useAutoStageName`'s own policy all ask the same
 * question and get the same answer. The policy — whether the proposal is
 * WRITTEN, and whether the name on the stage is the researcher's — is
 * `useAutoStageName`'s and is deliberately not here.
 *
 * Always answers with a name. Every stage type has an English name of its own
 * in `STAGE_TYPE_NAMES`, so there is no stage this cannot propose something
 * for, and a caller is never left deciding what to do with nothing.
 *
 * The result is English whatever the reader's language, and that is not an
 * oversight: it seeds a STORED value rather than being copy. The reasoning,
 * and what breaks if it is localized, is written out over `STAGE_TYPE_NAMES`
 * in `generateStageLabel.ts`.
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
 * Every attribute in the codebook by its record key, whichever entity type
 * declares it. A nomination prompt names an attribute by key alone, so the
 * lookup cannot be scoped to one entity.
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

/**
 * The names already taken, so a proposal is unique in the interview.
 *
 * The stage being named is excluded: a host that has already written it into
 * the protocol would otherwise have every proposal collide with the stage's
 * own last accepted name and come back suffixed ` #2`, then ` #3`.
 */
function existingStageLabels(
  context: ProtocolBuilderProtocolContext,
  stageId: string | undefined,
): string[] {
  return context.orderedStages
    .filter((stage) => stage.id !== stageId)
    .map((stage) => stage.label)
    .filter((label) => label !== '');
}
