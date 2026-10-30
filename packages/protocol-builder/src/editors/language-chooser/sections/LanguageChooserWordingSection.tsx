import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { WordingRow, type WordingSetting } from '../../../form/WordingRow.tsx';
import StageWordingSection from '../../../sections/supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../sections/supplied-wording/suppliedStageWording.ts';
import { languageChooserMessages as messages } from './languageChooserMessages.ts';

const HEADING: WordingSetting = {
  path: 'title',
  label: messages.headingLabel,
  hint: messages.headingHint,
};

const PATHS = [HEADING.path];

/**
 * The heading over the languages. It starts with Network Canvas's wording,
 * which the participant reads in the language the interview is shown in, so
 * it changes as they choose.
 */
export default function LanguageChooserWordingSection() {
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording('LanguageChooser');

  return (
    <StageWordingSection stageType="LanguageChooser" paths={PATHS}>
      {supplied !== undefined && (
        <WordingRow
          setting={HEADING}
          initialValue={startingWording(
            committedFields,
            HEADING.path,
            supplied,
          )}
        />
      )}
    </StageWordingSection>
  );
}
