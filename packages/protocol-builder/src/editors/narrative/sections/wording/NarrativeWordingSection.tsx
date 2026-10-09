import { useAppIntl } from '@codaco/app-i18n/react';
import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../../form/stageFormHooks.ts';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../../form/suppliedStageWording.ts';
import {
  WordingRow,
  type WordingSetting,
} from '../../../../form/WordingRow.tsx';
import BuilderSection from '../../../../sections/BuilderSection.tsx';
import { narrativeWordingMessages as messages } from './narrativeWordingMessages.ts';

const STAGE_TYPE = 'Narrative';

/** The panel headings, each asked while a preset makes its panel appear. */
const HEADINGS: readonly WordingSetting[] = [
  {
    path: 'attributesHeading',
    label: messages.attributesHeadingLabel,
    hint: messages.attributesHeadingHint,
  },
  {
    path: 'linksHeading',
    label: messages.linksHeadingLabel,
    hint: messages.linksHeadingHint,
  },
  {
    path: 'groupsHeading',
    label: messages.groupsHeadingLabel,
    hint: messages.groupsHeadingHint,
  },
];

/** The drawing tools' words, asked while drawing is on. */
const DRAWING_TOOLTIPS: readonly WordingSetting[] = [
  {
    path: 'tooltips.enableDrawing',
    label: messages.enableDrawingTooltipLabel,
    hint: messages.drawingTooltipHint,
  },
  {
    path: 'tooltips.disableDrawing',
    label: messages.disableDrawingTooltipLabel,
    hint: messages.drawingTooltipHint,
  },
  {
    path: 'tooltips.freezeAnnotations',
    label: messages.freezeAnnotationsTooltipLabel,
    hint: messages.drawingTooltipHint,
  },
  {
    path: 'tooltips.unfreezeAnnotations',
    label: messages.unfreezeAnnotationsTooltipLabel,
    hint: messages.drawingTooltipHint,
  },
  {
    path: 'tooltips.resetAnnotations',
    label: messages.resetAnnotationsTooltipLabel,
    hint: messages.drawingTooltipHint,
  },
];

/** The layout tools' words, asked while automatic layout is on. */
const LAYOUT_TOOLTIPS: readonly WordingSetting[] = [
  {
    path: 'tooltips.pauseLayout',
    label: messages.pauseLayoutTooltipLabel,
    hint: messages.layoutTooltipHint,
  },
  {
    path: 'tooltips.resumeLayout',
    label: messages.resumeLayoutTooltipLabel,
    hint: messages.layoutTooltipHint,
  },
];

/**
 * The words a participant reads on the narrative canvas. Each heading is asked
 * while a preset makes the panel it names appear, and each tool's words while
 * the behaviour that tool belongs to is on. Each starts with Network Canvas's
 * wording, and the same configurations that make the protocol require it
 * decide which are asked.
 */
export default function NarrativeWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    presets: useStageValue('presets'),
    behaviours: useStageValue('behaviours'),
  };

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined &&
        [...HEADINGS, ...DRAWING_TOOLTIPS, ...LAYOUT_TOOLTIPS]
          .filter((setting) =>
            suppliedStageSettingApplies(stage, setting.path.split('.')),
          )
          .map((setting) => (
            <WordingRow
              key={setting.path}
              setting={setting}
              initialValue={startingWording(
                committedFields,
                setting.path,
                supplied,
              )}
            />
          ))}
    </BuilderSection>
  );
}
