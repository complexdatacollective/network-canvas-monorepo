import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { narrativePedigreeMessages } from '@codaco/protocol-builder/editors/narrative-pedigree/narrativePedigreeMessages';
import { narrativeWordingMessages } from '@codaco/protocol-builder/editors/narrative/narrativeWordingMessages';
import { stageWordingMessages } from '@codaco/protocol-builder/sections/supplied-wording/stageWordingMessages';
import {
  type LocalizedString,
  suppliedStageSettingApplies,
} from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryMessage, SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';
import { stageMessageArguments } from './stageMessageArguments';

type WordingSetting = {
  /** The setting's path inside the stage, as the schema names it. */
  path: string;
  label: MessageDescriptor;
};

type WordingSpec = {
  title: MessageDescriptor;
  settings: WordingSetting[];
};

const wording = (
  title: MessageDescriptor,
  settings: WordingSetting[],
): WordingSpec => ({ title, settings });

/**
 * The stage types whose words Network Canvas supplies, with the settings the
 * editor's Customize built-in wording section offers, in the editor's order.
 * Words every stage of a type shows alike are the protocol's interface text,
 * which the summary shows once.
 */
const WORDING: Partial<Record<string, WordingSpec>> = {
  Narrative: wording(stageWordingMessages.title, [
    {
      path: 'attributesHeading',
      label: narrativeWordingMessages.attributesHeadingLabel,
    },
    { path: 'linksHeading', label: narrativeWordingMessages.linksHeadingLabel },
    {
      path: 'groupsHeading',
      label: narrativeWordingMessages.groupsHeadingLabel,
    },
  ]),
  NarrativePedigree: wording(stageWordingMessages.title, [
    {
      path: 'saveSnapshot',
      label: narrativePedigreeMessages.saveSnapshotButtonLabel,
    },
    {
      path: 'conditionText.selectCondition',
      label: narrativePedigreeMessages.selectConditionLabel,
    },
    {
      path: 'conditionText.snapshotCondition',
      label: narrativePedigreeMessages.snapshotConditionLabel,
    },
    {
      path: 'conditionText.snapshotInheritance',
      label: narrativePedigreeMessages.snapshotInheritanceLabel,
    },
  ]),
};

/** The text a stage holds at a path, or undefined where it holds none. */
const valueAt = (
  stage: Record<string, unknown>,
  path: string[],
): LocalizedString | undefined => {
  let current: unknown = stage;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return typeof current === 'object' && current !== null
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the path names a localized text setting, which the schema holds as a locale-to-string record
      (current as LocalizedString)
    : undefined;
};

type CanvasWordingProps = {
  type: string;
  configuration: Record<string, unknown>;
};

/**
 * The words on the canvas a stage holds: each supplied setting the stage's
 * choices make apply, and that the protocol sets. A stage type with no such
 * settings prints nothing.
 */
const CanvasWording = ({ type, configuration }: CanvasWordingProps) => {
  const intl = useAppIntl();
  const spec = WORDING[type];
  if (!spec) return null;
  const stage = { ...configuration, type };
  const declarations = stageMessageArguments(stage);
  const rows = spec.settings.flatMap(({ path, label }) => {
    const keys = path.split('.');
    if (!suppliedStageSettingApplies(stage, keys)) return [];
    const value = valueAt(configuration, keys);
    if (value === undefined) return [];
    const declaration = declarations.get(path);
    return [
      [
        intl.formatMessage(label),
        declaration === undefined ? (
          <SummaryText key={path} value={value} />
        ) : (
          <SummaryMessage
            key={path}
            value={value}
            messageArguments={declaration}
          />
        ),
      ],
    ];
  });
  if (rows.length === 0) return null;
  return (
    <SectionFrame title={intl.formatMessage(spec.title)}>
      <MiniTable rotated rows={rows} />
    </SectionFrame>
  );
};

export default CanvasWording;
