import { useAppIntl } from '@codaco/app-i18n/react';
import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { WordingRow, type WordingSetting } from '../../../form/WordingRow.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import { composerMessages as messages } from './composerMessages.ts';

const STAGE_TYPE = 'NetworkComposer';

/** The words a participant reads while building the network on the canvas. */
const WORDS: readonly WordingSetting[] = [
  {
    path: 'addNamePlaceholder',
    label: messages.addNamePlaceholderLabel,
  },
  {
    path: 'overtakenEditNotice',
    label: messages.overtakenEditNoticeLabel,
  },
  {
    path: 'groupsHeading',
    label: messages.groupsHeadingLabel,
    hint: messages.groupsHeadingHint,
  },
  {
    path: 'tooltips.addPerson',
    label: messages.addNodeTooltipLabel,
  },
  {
    path: 'tooltips.automaticLayout',
    label: messages.automaticLayoutTooltipLabel,
  },
  {
    path: 'tooltips.drawConnection',
    label: messages.drawConnectionTooltipLabel,
    hint: messages.drawConnectionTooltipHint,
  },
];

/**
 * The words a participant reads while building the network: the name box, the
 * warning about an edit an undo or redo overtook, and the labels of the canvas
 * tools. Each starts with Network Canvas's wording. The groups heading is
 * asked only while the canvas groups members, and the connection tooltip only
 * while it has connection types: the same configurations that make the
 * protocol require them.
 */
export default function ComposerWordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    convexHullVariable: useStageValue('convexHullVariable'),
    edges: useStageValue('edges'),
  };

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined &&
        WORDS.filter((setting) =>
          suppliedStageSettingApplies(stage, setting.path.split('.')),
        ).map((setting) => (
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
