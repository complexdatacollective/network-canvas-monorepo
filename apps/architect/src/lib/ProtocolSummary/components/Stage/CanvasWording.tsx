import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { narrativePedigreeMessages } from '@codaco/protocol-builder/editors/narrative-pedigree/narrativePedigreeMessages';
import { narrativeWordingMessages } from '@codaco/protocol-builder/editors/narrative/narrativeWordingMessages';
import { composerMessages } from '@codaco/protocol-builder/editors/network-composer/composerMessages';
import { sociogramWordingMessages } from '@codaco/protocol-builder/editors/sociogram/sociogramWordingMessages';
import {
  type LocalizedString,
  suppliedStageSettingApplies,
} from '@codaco/protocol-validation';

import MiniTable from '../MiniTable';
import { SummaryText } from '../SummaryText';
import SectionFrame from './SectionFrame';

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
 * editor's Words on the canvas section offers, in the editor's order.
 */
const WORDING: Partial<Record<string, WordingSpec>> = {
  NetworkComposer: wording(composerMessages.wordingTitle, [
    {
      path: 'addNamePlaceholder',
      label: composerMessages.addNamePlaceholderLabel,
    },
    {
      path: 'overtakenEditNotice',
      label: composerMessages.overtakenEditNoticeLabel,
    },
    { path: 'groupsHeading', label: composerMessages.groupsHeadingLabel },
    { path: 'tooltips.addPerson', label: composerMessages.addNodeTooltipLabel },
    {
      path: 'tooltips.automaticLayout',
      label: composerMessages.automaticLayoutTooltipLabel,
    },
    {
      path: 'tooltips.drawConnection',
      label: composerMessages.drawConnectionTooltipLabel,
    },
  ]),
  Narrative: wording(narrativeWordingMessages.wordingTitle, [
    {
      path: 'attributesHeading',
      label: narrativeWordingMessages.attributesHeadingLabel,
    },
    { path: 'linksHeading', label: narrativeWordingMessages.linksHeadingLabel },
    {
      path: 'groupsHeading',
      label: narrativeWordingMessages.groupsHeadingLabel,
    },
    {
      path: 'tooltips.enableDrawing',
      label: narrativeWordingMessages.enableDrawingTooltipLabel,
    },
    {
      path: 'tooltips.disableDrawing',
      label: narrativeWordingMessages.disableDrawingTooltipLabel,
    },
    {
      path: 'tooltips.freezeAnnotations',
      label: narrativeWordingMessages.freezeAnnotationsTooltipLabel,
    },
    {
      path: 'tooltips.unfreezeAnnotations',
      label: narrativeWordingMessages.unfreezeAnnotationsTooltipLabel,
    },
    {
      path: 'tooltips.resetAnnotations',
      label: narrativeWordingMessages.resetAnnotationsTooltipLabel,
    },
    {
      path: 'tooltips.pauseLayout',
      label: narrativeWordingMessages.pauseLayoutTooltipLabel,
    },
    {
      path: 'tooltips.resumeLayout',
      label: narrativeWordingMessages.resumeLayoutTooltipLabel,
    },
  ]),
  Sociogram: wording(sociogramWordingMessages.wordingTitle, [
    {
      path: 'tooltips.pauseLayout',
      label: sociogramWordingMessages.pauseLayoutTooltipLabel,
    },
    {
      path: 'tooltips.resumeLayout',
      label: sociogramWordingMessages.resumeLayoutTooltipLabel,
    },
  ]),
  NarrativePedigree: wording(narrativePedigreeMessages.wordingTitle, [
    { path: 'keyHeading', label: narrativePedigreeMessages.keyHeadingLabel },
    {
      path: 'tooltips.clearFocus',
      label: narrativePedigreeMessages.clearFocusTooltipLabel,
    },
    {
      path: 'tooltips.saveSnapshot',
      label: narrativePedigreeMessages.saveSnapshotTooltipLabel,
    },
    {
      path: 'conditionText.heading',
      label: narrativePedigreeMessages.conditionHeadingLabel,
    },
    {
      path: 'conditionText.instruction',
      label: narrativePedigreeMessages.conditionInstructionLabel,
    },
    {
      path: 'conditionText.notation.affected',
      label: narrativePedigreeMessages.affectedNotationLabel,
    },
    {
      path: 'conditionText.notation.obligateAffected',
      label: narrativePedigreeMessages.obligateAffectedNotationLabel,
    },
    {
      path: 'conditionText.notation.obligateCarrier',
      label: narrativePedigreeMessages.obligateCarrierNotationLabel,
    },
    {
      path: 'conditionText.notation.atRiskAffected',
      label: narrativePedigreeMessages.atRiskAffectedNotationLabel,
    },
    {
      path: 'conditionText.notation.atRiskCarrier',
      label: narrativePedigreeMessages.atRiskCarrierNotationLabel,
    },
    {
      path: 'conditionText.notation.unknown',
      label: narrativePedigreeMessages.unknownNotationLabel,
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
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'object' && current !== null
    ? (current as LocalizedString)
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
  const rows = spec.settings.flatMap(({ path, label }) => {
    const keys = path.split('.');
    if (!suppliedStageSettingApplies(stage, keys)) return [];
    const value = valueAt(configuration, keys);
    return value === undefined
      ? []
      : [[intl.formatMessage(label), <SummaryText key={path} value={value} />]];
  });
  if (rows.length === 0) return null;
  return (
    <SectionFrame title={intl.formatMessage(spec.title)}>
      <MiniTable rotated rows={rows} />
    </SectionFrame>
  );
};

export default CanvasWording;
