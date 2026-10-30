import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { WordingRow, type WordingSetting } from '../../../form/WordingRow.tsx';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
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
    wraps: true,
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
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    convexHullVariable: useStageValue('convexHullVariable'),
    edges: useStageValue('edges'),
  };

  const shown = WORDS.filter((setting) =>
    suppliedStageSettingApplies(stage, setting.path.split('.')),
  );

  return (
    <StageWordingSection
      stageType={STAGE_TYPE}
      paths={shown.map((setting) => setting.path)}
    >
      {supplied !== undefined &&
        shown.map((setting) => (
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
    </StageWordingSection>
  );
}
