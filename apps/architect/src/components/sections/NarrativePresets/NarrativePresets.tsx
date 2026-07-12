import { isEmpty, omit } from 'es-toolkit/compat';
import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import PresetFields from './PresetFields';
import PresetPreview from './PresetPreview';
const hasDisplayEdges = (edges: unknown): boolean => {
  if (edges === null || typeof edges !== 'object' || !('display' in edges)) {
    return false;
  }
  const { display } = edges;
  return Array.isArray(display) && display.length > 0;
};
export const normalizePreset = (values: Record<string, unknown>) => {
  const keysToOmit: string[] = [];
  if (isEmpty(values.groupVariable)) {
    keysToOmit.push('groupVariable');
  }
  // `edges`/`highlight` are optional but non-nullable in the schema. Toggling
  // a section off in architect leaves a `null` (or vestigial empty) value, so
  // strip the key entirely rather than persisting a schema-invalid null/empty.
  if (!hasDisplayEdges(values.edges)) {
    keysToOmit.push('edges');
  }
  if (isEmpty(values.highlight)) {
    keysToOmit.push('highlight');
  }
  if (keysToOmit.length === 0) {
    return values;
  }
  return omit(values, keysToOmit);
};
const template = () => ({
  layoutVariable: null,
  groupVariable: null,
  edges: {
    display: [],
  },
  highlight: [],
});
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type NarrativePresetsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};
const NarrativePresets = ({
  entity,
  type,
  disabled,
  disabledMessage,
}: NarrativePresetsProps) => (
  <Section
    disabled={disabled}
    disabledMessage={disabledMessage}
    summary={
      <Paragraph>
        Add one or more &quot;presets&quot; below, to create different
        visualizations that you can switch between within the interview.
      </Paragraph>
    }
    title="Narrative Presets"
  >
    <ValidatedFieldArray
      name="presets"
      label="Narrative presets"
      component={DialogArrayField}
      validation={{ notEmpty }}
      componentProps={{
        addTitle: 'Edit Preset',
        editorFieldsComponent: PresetFields,
        editorProps: { entity, type },
        editorTitle: 'Edit Preset',
        itemLabel: 'preset',
        itemTemplate: template,
        normalizeItem: normalizePreset,
        previewComponent: PresetPreview,
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<NarrativePresetsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
)(NarrativePresets);
