import type {
  FinishKinds,
  FinishMode,
  FinishOutcome,
  Item,
  MediaKinds,
  Panel,
  PanelSource,
  StageNameWording,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';

import type { Qualifier } from './generateStageLabel.ts';
import {
  formatStageNameMessage,
  type StageNameLanguage,
} from './stageNameLanguage.ts';

type EntityNameResolver = (
  entity: 'node' | 'edge',
  type: string,
) => string | null;

type QualifierResolvers = {
  resolveAssetType: (assetId: string) => string | null;
};

/**
 * Only the data source distinguishes the panel qualifiers, so a caller may
 * pass panels carrying nothing else — and `proposeStageLabel`, the only caller,
 * does: its own `StageLabelPanel` is this same slice of the schema's `Panel`.
 */
type PanelQualifierInput = Pick<Panel, 'dataSource'>;

type QualifierStageFields = {
  type?: StageType;
  panels?: PanelQualifierInput[];
  items?: Item[];
  mode?: FinishMode;
  outcome?: FinishOutcome;
};

export function resolveStageSubjectName(
  subject: StageSubject | undefined,
  resolveEntityName: EntityNameResolver,
): string | null {
  if (!subject || subject.entity === 'ego' || !subject.type) {
    return null;
  }
  return resolveEntityName(subject.entity, subject.type) || null;
}

/**
 * Each qualifier is one of the language's wording messages (`panels`,
 * `media`, `finish`) told which case applies, so a language words it and
 * orders its parts as it needs to. The cases are declared with the wording
 * (`PanelSource`, `MediaKinds`, `FinishKinds`).
 */
function qualifierText(
  language: StageNameLanguage,
  message: keyof Pick<StageNameWording, 'panels' | 'media' | 'finish'>,
  argument: 'source' | 'media' | 'finish',
  value: PanelSource | MediaKinds | FinishKinds,
): string {
  return formatStageNameMessage(language, language.wording[message], {
    [argument]: value,
  });
}

function resolvePanelQualifier(
  panels: PanelQualifierInput[] | undefined,
  language: StageNameLanguage,
): Qualifier | null {
  if (!panels || panels.length === 0) {
    return null;
  }
  const hasExisting = panels.some((panel) => panel.dataSource === 'existing');
  const hasRoster = panels.some((panel) => panel.dataSource !== 'existing');
  let source: PanelSource = 'network';
  if (hasExisting && hasRoster) {
    source = 'both';
  } else if (hasRoster) {
    source = 'roster';
  }
  const text = qualifierText(language, 'panels', 'source', source);
  return { full: text, summary: text };
}

// Canonical order so the same set of media always yields the same name,
// regardless of the order the Information items happen to be in.
const MEDIA_ORDER = ['image', 'video', 'audio'] as const;

const MEDIA_KINDS: Record<string, MediaKinds> = {
  'image': 'image',
  'video': 'video',
  'audio': 'audio',
  'image,video': 'imageVideo',
  'image,audio': 'imageAudio',
  'video,audio': 'videoAudio',
  'image,video,audio': 'imageVideoAudio',
};

function resolveInformationQualifier(
  items: Item[] | undefined,
  resolveAssetType: (assetId: string) => string | null,
  language: StageNameLanguage,
): Qualifier | null {
  if (!items) {
    return null;
  }
  const present = new Set(
    items
      .filter((item) => item.type === 'asset')
      .map((item) => resolveAssetType(item.content)),
  );
  const kinds =
    MEDIA_KINDS[MEDIA_ORDER.filter((kind) => present.has(kind)).join(',')];
  if (kinds === undefined) {
    return null;
  }
  return {
    full: qualifierText(language, 'media', 'media', kinds),
    summary: qualifierText(language, 'media', 'media', 'summary'),
  };
}

const FINISH_AUTOMATIC: Record<FinishOutcome, FinishKinds> = {
  completed: 'completedAutomatic',
  ineligible: 'ineligibleAutomatic',
  terminated: 'terminatedAutomatic',
};

/**
 * A finish stage is told apart by how the interview ended there, and then by
 * whether it ends without asking: a protocol may end in several, and the
 * outcome is what distinguishes them. Confirmation, the usual mode, goes
 * unsaid.
 */
function resolveFinishQualifier(
  outcome: FinishOutcome | undefined,
  mode: FinishMode | undefined,
  language: StageNameLanguage,
): Qualifier | null {
  const automatic = mode === 'automatic';
  if (outcome === undefined && !automatic) {
    return null;
  }
  const outcomeKind: FinishKinds | undefined = outcome;
  const fullKind: FinishKinds =
    outcome === undefined
      ? 'automatic'
      : automatic
        ? FINISH_AUTOMATIC[outcome]
        : outcome;
  return {
    full: qualifierText(language, 'finish', 'finish', fullKind),
    summary: qualifierText(
      language,
      'finish',
      'finish',
      outcomeKind ?? fullKind,
    ),
  };
}

export function resolveStageQualifier(
  stage: QualifierStageFields,
  resolvers: QualifierResolvers,
  language: StageNameLanguage,
): Qualifier | null {
  switch (stage.type) {
    case 'NameGenerator':
    case 'NameGeneratorQuickAdd':
      return resolvePanelQualifier(stage.panels, language);
    case 'Information':
      return resolveInformationQualifier(
        stage.items,
        resolvers.resolveAssetType,
        language,
      );
    case 'FinishSession':
      return resolveFinishQualifier(stage.outcome, stage.mode, language);
    case 'AlterEdgeForm':
    case 'AlterForm':
    case 'Anonymisation':
    case 'CategoricalBin':
    case 'DyadCensus':
    case 'EgoForm':
    case 'FamilyPedigree':
    case 'Geospatial':
    case 'LanguageChooser':
    case 'NameGeneratorRoster':
    case 'Narrative':
    case 'NarrativePedigree':
    case 'NetworkComposer':
    case 'OneToManyDyadCensus':
    case 'OrdinalBin':
    case 'Sociogram':
    case 'TieStrengthCensus':
    case undefined:
    default:
      return null;
  }
}
