import type {
  Item,
  Panel,
  StageSubject,
  StageType,
} from '@codaco/protocol-validation';

import type { Qualifier } from './generateStageLabel';

type EntityNameResolver = (
  entity: 'node' | 'edge',
  type: string,
) => string | null;

type QualifierResolvers = {
  resolveAssetType: (assetId: string) => string | null;
  resolveVariableName: (variableId: string) => string | null;
};

type QualifierStageFields = {
  type?: StageType;
  panels?: Panel[];
  items?: Item[];
  nominationPrompts?: { variable: string }[];
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

function joinList(values: string[]): string {
  if (values.length === 1) {
    return values[0]!;
  }
  if (values.length === 2) {
    return `${values[0]} & ${values[1]}`;
  }
  return `${values.slice(0, -1).join(', ')} & ${values[values.length - 1]}`;
}

export function buildListQualifier(
  rawValues: string[],
  options: { singularNoun?: string; pluralNoun?: string; summaryNoun: string },
): Qualifier | null {
  const values = [
    ...new Set(rawValues.filter((value) => value && value.trim())),
  ];
  if (values.length === 0) {
    return null;
  }
  const summary = `with ${options.summaryNoun}`;
  if (values.length > 3) {
    return { full: summary, summary };
  }
  const noun =
    options.singularNoun && options.pluralNoun
      ? ` ${values.length === 1 ? options.singularNoun : options.pluralNoun}`
      : '';
  return { full: `with ${joinList(values)}${noun}`, summary };
}

const MEDIA_LABELS: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
};

function resolvePanelQualifier(panels: Panel[] | undefined): Qualifier | null {
  if (!panels || panels.length === 0) {
    return null;
  }
  const hasExisting = panels.some((panel) => panel.dataSource === 'existing');
  const hasRoster = panels.some((panel) => panel.dataSource !== 'existing');
  let text = 'with Network Panels';
  if (hasExisting && hasRoster) {
    text = 'with Panels';
  } else if (hasRoster) {
    text = 'with Roster Panels';
  }
  return { full: text, summary: text };
}

function resolveInformationQualifier(
  items: Item[] | undefined,
  resolveAssetType: (assetId: string) => string | null,
): Qualifier | null {
  if (!items) {
    return null;
  }
  const mediaLabels = items
    .filter((item) => item.type === 'asset')
    .map((item) => resolveAssetType(item.content))
    .map((type) => (type ? (MEDIA_LABELS[type] ?? null) : null))
    .filter((label): label is string => Boolean(label));
  return buildListQualifier(mediaLabels, { summaryNoun: 'Media' });
}

function resolveNominationQualifier(
  prompts: { variable: string }[] | undefined,
  resolveVariableName: (variableId: string) => string | null,
): Qualifier | null {
  if (!prompts) {
    return null;
  }
  const names = prompts
    .map((prompt) => resolveVariableName(prompt.variable))
    .filter((name): name is string => Boolean(name));
  return buildListQualifier(names, {
    singularNoun: 'Nomination',
    pluralNoun: 'Nominations',
    summaryNoun: 'Nominations',
  });
}

export function resolveStageQualifier(
  stage: QualifierStageFields,
  resolvers: QualifierResolvers,
): Qualifier | null {
  switch (stage.type) {
    case 'NameGenerator':
    case 'NameGeneratorQuickAdd':
      return resolvePanelQualifier(stage.panels);
    case 'Information':
      return resolveInformationQualifier(
        stage.items,
        resolvers.resolveAssetType,
      );
    case 'FamilyPedigree':
      return resolveNominationQualifier(
        stage.nominationPrompts,
        resolvers.resolveVariableName,
      );
    default:
      return null;
  }
}
