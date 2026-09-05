import { isEmpty, omit } from 'es-toolkit/compat';
import type { ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import PresetFields from './PresetFields';
import PresetPreview from './PresetPreview';
const remainingMessages = defineMessages({
  editPreset: {
    id: 'architect.remaining.sections.narrativePresets.narrativePresets.editPreset',
    defaultMessage: 'Edit Preset',
    description:
      'The addTitle text in components / sections / NarrativePresets / NarrativePresets.',
  },
});
const additionalMessages = defineMessages({
  createNewPreset: {
    id: 'architect.additional.sections.narrativePresets.narrativePresets.createNewPreset',
    defaultMessage: 'Create new preset',
    description:
      'The addButtonLabel text in components / sections / NarrativePresets / NarrativePresets.',
  },
});
const messages = defineMessages({
  visualizationPresets: {
    id: 'architect.sections.narrativePresets.narrativePresets.visualizationPresets',
    defaultMessage: 'Visualization presets',
    description:
      'The title text in components / sections / NarrativePresets / NarrativePresets.',
  },
  createVisualizationsThatResearchersCanSwitch: {
    id: 'architect.sections.narrativePresets.narrativePresets.createVisualizationsThatResearchersCanSwitch',
    defaultMessage:
      'Create visualizations that researchers can switch between during the interview.',
    description:
      'The description text in components / sections / NarrativePresets / NarrativePresets.',
  },
  presets: {
    id: 'architect.sections.narrativePresets.narrativePresets.presets',
    defaultMessage: 'Presets',
    description:
      'The label text in components / sections / NarrativePresets / NarrativePresets.',
  },
  addOneOrMorePresetsBelow: {
    id: 'architect.sections.narrativePresets.narrativePresets.addOneOrMorePresetsBelow',
    defaultMessage:
      'Add one or more "presets" below, to create different visualizations that you can switch between within the interview.',
    description:
      'Visible text in components / sections / NarrativePresets / NarrativePresets.',
  },
});

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
  const intl = useAppIntl();
  const { entity, type } = useSubject();
  const initialPresets = useStageInitialValue<Preset[]>('presets');
  const availabilityProps = disabled
    ? ({ toggleable: true, defaultOpen: false, disabled: true } as const)
    : {};

  return (
    <Section
      key={disabled ? 'disabled' : 'enabled'}
      title={intl.formatMessage(messages.visualizationPresets)}
      description={
        disabled
          ? disabledMessage
          : intl.formatMessage(
              messages.createVisualizationsThatResearchersCanSwitch,
            )
      }
      {...availabilityProps}
    >
      <ArchitectArrayField
        name="presets"
        label={intl.formatMessage(messages.presets)}
        hint={
          <Paragraph>
            {intl.formatMessage(messages.addOneOrMorePresetsBelow)}
          </Paragraph>
        }
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(additionalMessages.createNewPreset)}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        initialValue={initialPresets}
        addTitle={intl.formatMessage(remainingMessages.editPreset)}
        editorFieldsComponent={
          PresetFields as ComponentType<Record<string, unknown>>
        }
        editorProps={{ entity, type }}
        editorTitle={intl.formatMessage(remainingMessages.editPreset)}
        itemLabelMessage={arrayItemMessages.preset}
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
