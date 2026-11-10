import type {
  Codebook,
  FinishMode,
  FinishOutcome,
  Item,
  Panel,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';

import {
  resolveTranslation,
  translationText,
} from '../localization/localizedText.ts';
import type { ProtocolBuilderProtocolContext } from '../protocol-context.ts';
import { generateStageLabel } from './generateStageLabel.ts';
import {
  resolveStageQualifier,
  resolveStageSubjectName,
} from './resolveStageNameParts.ts';
import { stageNameLanguageOf } from './stageNameLanguage.ts';

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
  panels?: readonly StageLabelPanel[] | undefined;
  mode?: FinishMode | undefined;
  outcome?: FinishOutcome | undefined;
}>;

/**
 * What this stage would be called if nobody had named it, or `undefined` when
 * nothing is proposed.
 *
 * Pure, and callable without mounting anything, so a timeline, a create flow
 * and `useAutoStageName` all get the same answer. Whether the proposal is
 * WRITTEN is `useAutoStageName`'s and is deliberately not here.
 *
 * The name is in the protocol's DEFAULT language when Network Canvas supplies
 * wording in it (`stageNameWordingFor`), whatever language Architect itself is
 * in, because it is written as that language's text of the stage's name. Where
 * Network Canvas supplies none there is no proposal, rather than one in
 * another language: the researcher names the stage. The answer is plain text,
 * written as the name's default-language translation.
 */
export function proposeStageLabel(
  stage: StageLabelDraft,
  context: ProtocolBuilderProtocolContext,
): string | undefined {
  const language = stageNameLanguageOf(context.localization);
  if (language === undefined) {
    return undefined;
  }
  const subjectName = resolveStageSubjectName(stage.subject, (entity, type) =>
    entityName(context.codebook, entity, type),
  );
  const qualifier = resolveStageQualifier(
    {
      type: stage.type,
      ...(stage.panels === undefined ? {} : { panels: [...stage.panels] }),
      ...(stage.items === undefined ? {} : { items: [...stage.items] }),
      ...(stage.mode === undefined ? {} : { mode: stage.mode }),
      ...(stage.outcome === undefined ? {} : { outcome: stage.outcome }),
    },
    {
      resolveAssetType: (assetId) => context.assets[assetId]?.type ?? null,
    },
    language,
  );
  return generateStageLabel({
    language,
    typeName: language.wording.types[stage.type],
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
 * The names already taken, so a proposal is unique in the interview. Compared
 * as the default-language text of each name, the language a proposal is
 * written in: a name that exists only in another language does not occupy it.
 * Where the protocol's languages are not known, the first text a name holds.
 */
function existingStageLabels(
  context: ProtocolBuilderProtocolContext,
  stageId: string | undefined,
): string[] {
  const { localization } = context;
  return context.orderedStages
    .filter((stage) => stage.id !== stageId)
    .map((stage) =>
      localization === undefined
        ? resolveTranslation(stage.label, undefined, undefined).text
        : translationText(stage.label, localization.defaultLocale),
    )
    .filter((label) => label !== '');
}
