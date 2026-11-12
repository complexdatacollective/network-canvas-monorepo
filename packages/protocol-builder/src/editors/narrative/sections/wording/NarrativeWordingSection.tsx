import { suppliedStageSettingApplies } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../../form/stageFormHooks.ts';
import {
  WordingRow,
  type WordingSetting,
} from '../../../../form/WordingRow.tsx';
import StageWordingSection from '../../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../../sections/supplied-wording/suppliedStageWording.ts';
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

/**
 * The words a participant reads on the narrative canvas. Each heading is asked
 * while a preset makes the panel it names appear, and starts with Network
 * Canvas's wording; the same configurations that make the protocol require it
 * decide which are asked. The drawing tools' words are the same on every
 * Narrative stage, so the protocol holds them once (see `SharedStageWording`).
 */
export default function NarrativeWordingSection() {
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    presets: useStageValue('presets'),
  };

  const shown = HEADINGS.filter((setting) =>
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
