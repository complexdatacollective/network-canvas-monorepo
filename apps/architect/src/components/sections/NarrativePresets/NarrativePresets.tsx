import { isEmpty, omit } from 'es-toolkit/compat';
import type { ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import PresetFields from './PresetFields';
import PresetPreview from './PresetPreview';

type Preset = Record<string, unknown>;

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

// Deliberately NOT `StageEditorSectionProps & {...}`: `withDisabledSubjectRequired`
// only ever supplies `{interfaceType?, type?}` (own) and `{disabled,
// disabledMessage}` (injected) — the component it wraps must accept exactly
// that shape (or less) for the composition below to typecheck. `stagePath`/
// `stagePosition` pass through unread (the section doesn't need them).
type NarrativePresetsProps = {
  disabled?: boolean;
  disabledMessage?: string;
};

const NarrativePresets = ({
  disabled,
  disabledMessage,
}: NarrativePresetsProps) => {
  const { entity, type } = useSubject();
  const initialPresets = useStageInitialValue<Preset[]>('presets');

  return (
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
      <ArchitectArrayField
        name="presets"
        label="Narrative presets"
        labelHidden
        component={DialogArrayField}
        validation={{ notEmpty }}
        initialValue={initialPresets}
        addTitle="Edit Preset"
        editorFieldsComponent={
          PresetFields as ComponentType<Record<string, unknown>>
        }
        editorProps={{ entity, type }}
        editorTitle="Edit Preset"
        itemLabel="preset"
        itemTemplate={template}
        normalizeItem={(value) =>
          normalizePreset(value as Record<string, unknown>)
        }
        previewComponent={
          PresetPreview as ComponentType<Record<string, unknown>>
        }
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

const NarrativePresetsWithDisabledState =
  withDisabledSubjectRequired(NarrativePresets);

/**
 * `withDisabledSubjectRequired` computes `disabled`/`disabledMessage` from
 * `interfaceType`/`type` props (the `withSubject` enhancer used to inject
 * `type`). Sections no longer receive `type` as a prop — it comes from
 * `useSubject()` — so this forwards it explicitly rather than composing the
 * two enhancers as before.
 */
const NarrativePresetsSection = (props: StageEditorSectionProps) => {
  const { type } = useSubject();
  return (
    <NarrativePresetsWithDisabledState {...props} type={type ?? undefined} />
  );
};

export default NarrativePresetsSection;
