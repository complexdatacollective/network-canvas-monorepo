import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
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
 * Resets `diseases` to an empty array, clearing any registered AND dormant
 * descendant first — the container-safe reset
 * `~/components/sections/Form/withFieldsHandlers.tsx`'s (not yet exported;
 * local copy pending that hoist) `useClearValue` established. `diseases`
 * itself has no descendants today (it is one opaque array field), but this
 * keeps the reset future-proof against that changing, while still leaving
 * the field an EMPTY ARRAY rather than `undefined` — Diseases.tsx's `notEmpty`
 * validator reports a friendly "create at least one" message only when the
 * field is actually registered with an array value; `undefined` would read as
 * a missing required field instead once schema-validated.
 */
const isDiseasesDescendant = (name: string) =>
  name.startsWith('diseases.') || name.startsWith('diseases[');

const clearDiseasesValue = (storeApi: StageFormStoreApi) => {
  const state = storeApi.getState();

  for (const name of state.fields.keys()) {
    if (isDiseasesDescendant(name)) state.setFieldValue(name, undefined);
  }
  for (const name of state.dormantValues.keys()) {
    if (isDiseasesDescendant(name)) state.setFieldValue(name, undefined);
  }
  state.setFieldValue('diseases', []);
};

const SourceStage = (_props: StageEditorSectionProps) => {
  const { storeApi } = useStageFormContext();
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
  useEffect(() => {
    const previous = previousSourceStageId.current;
    previousSourceStageId.current = sourceStageId;
    if (!previous || sourceStageId === previous) return;
    clearDiseasesValue(storeApi);
  }, [sourceStageId, storeApi]);

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
      <Row>
        <ArchitectField
          name="sourceStageId"
          component={StyledSelectField}
          label="Family Pedigree stage"
          initialValue={sourceStageIdInitial}
          placeholder="Select a Family Pedigree stage..."
          options={options}
          disabled={options.length === 0}
        />
      </Row>
    </Section>
  );
};
export default SourceStage;
