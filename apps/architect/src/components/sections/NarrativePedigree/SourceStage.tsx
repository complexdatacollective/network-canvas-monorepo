import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  type StageFormStoreApi,
  useStageFormContext,
} from '~/components/StageEditor/stageFormContext';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/store';
import { getStageList } from '~/selectors/protocol';

/**
 * Resets `diseases` to an empty array. The container-safe clear runs first so
 * any registered or dormant descendant goes too; the field is then left an
 * EMPTY ARRAY rather than `undefined` — Diseases.tsx's `notEmpty` validator
 * reports a friendly "create at least one" message only when the field is
 * actually registered with an array value; `undefined` would read as a
 * missing required field instead once schema-validated.
 */
const clearDiseasesValue = (storeApi: StageFormStoreApi) => {
  storeApi.getState().clearValue('diseases');
  storeApi.getState().setFieldValue('diseases', []);
};

const SourceStage = (_props: StageEditorSectionProps) => {
  const { storeApi, draft } = useStageFormContext();
  const sourceStageId = useStageFormValue<string>('sourceStageId');
  const sourceStageIdInitial = useStageInitialValue<string>('sourceStageId');
  const familyPedigreeStages = useSelector((state: RootState) =>
    getStageList(state).filter((stage) => stage.type === 'FamilyPedigree'),
  );
  const options = familyPedigreeStages.map((stage) => ({
    value: stage.id,
    label: stage.label,
  }));

  // Diseases map to boolean variables of the source stage's node type, so a
  // different source stage invalidates the existing selections. Clear them so
  // the researcher reconfigures against the new source rather than saving an
  // invalid stage that references the old node type's variables. An observer
  // effect rather than the `onChange` handler this replaces — the field's
  // caller `onChange` would replace the store write instead of running
  // alongside it — so `previousSourceStageId` tracks the field across
  // renders and skips the stage's first pick.
  const previousSourceStageId = useRef(sourceStageId);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersion = useRef(restoreVersion);
  useEffect(() => {
    const previous = previousSourceStageId.current;
    previousSourceStageId.current = sourceStageId;
    const previousVersion = previousRestoreVersion.current;
    previousRestoreVersion.current = restoreVersion;
    if (!previous || sourceStageId === previous) return;

    // An undo/redo restores the source stage together with the diseases that
    // belong to it, so clearing here would wipe the half of the restore the
    // user was reaching for.
    if (previousVersion !== restoreVersion) return;

    // As ONE gesture: `clearDiseasesValue` is two writes to a field the
    // sibling Diseases section keeps registered, and each of them is a
    // structural array change that would snapshot on its own. The stop between
    // them (`diseases` momentarily `undefined`) renders identically to the
    // final one, so undo appeared to do nothing for a press. The clear also
    // belongs in the SAME entry as the source-stage change it follows from,
    // which is what the gesture's single trailing snapshot gives it.
    draft.runGesture(() => {
      clearDiseasesValue(storeApi);
    });
  }, [draft, restoreVersion, sourceStageId, storeApi]);

  return (
    <Section
      title="Source Stage"
      summary={
        <Paragraph>
          Select the Family Pedigree stage whose network data this Narrative
          Pedigree will visualize. Only Family Pedigree stages are listed here.
        </Paragraph>
      }
    >
      <>
        <ArchitectField
          name="sourceStageId"
          component={StyledSelectField}
          label="Family Pedigree stage"
          initialValue={sourceStageIdInitial}
          placeholder="Select a Family Pedigree stage..."
          options={options}
          disabled={options.length === 0}
        />
      </>
    </Section>
  );
};
export default SourceStage;
