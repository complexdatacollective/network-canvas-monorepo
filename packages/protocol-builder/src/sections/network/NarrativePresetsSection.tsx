import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { useRowRenderers } from '../rowRenderers.tsx';
import { useStageSubject } from './codebookOptions.ts';
import {
  NarrativePresetFields,
  NarrativePresetPreview,
} from './NarrativePresetFields.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

const PRESETS_FIELD = 'presets';

const AT_LEAST_ONE_PRESET =
  'Create at least one preset. A narrative stage with no presets shows the participant nothing.';

/**
 * The rule that can actually refuse a save.
 *
 * The whole list is one field value, so a rule about the list itself belongs
 * here. The protocol schema refuses an empty list too, but it does so against
 * a path after the save is attempted; this refuses it in the section the
 * researcher is looking at.
 */
const presetsValidation = {
  custom: messageRuleValidation([
    (value: unknown) =>
      Array.isArray(value) && value.length > 0
        ? undefined
        : AT_LEAST_ONE_PRESET,
  ]),
};

export type NarrativePresetsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  /** Said instead of `description` while the section is waiting on a subject. */
  waitingDescription: string;
  fieldLabel: string;
  fieldHint: string;
  /** Visible text and accessible name of the add button. */
  addButtonLabel: string;
  addTitle: string;
  editorTitle: string;
  /**
   * Noun used in row affordances ("Edit preset", "Remove preset"), as a
   * descriptor: `DialogArrayField` formats it where it is read, or encodes it
   * for a reader further on, so a caller that resolved it to English first
   * would put an English noun in a Spanish sentence.
   */
  itemLabel: MessageDescriptor;
  emptyStateMessage: string;
}>;

const DEFAULT_COPY: NarrativePresetsCopy = {
  sectionTitle: 'Visualisation presets',
  description:
    'Build the ways of looking at the network that can be switched between during the interview.',
  waitingDescription:
    'Choose what this stage works with before building its presets.',
  fieldLabel: 'Presets',
  fieldHint:
    'Each preset is a whole picture of the network. They are offered in this order, so drag them into the order you want to talk through.',
  addButtonLabel: 'Create new preset',
  addTitle: 'Create preset',
  editorTitle: 'Edit preset',
  itemLabel: networkCanvasMessages.presetNoun,
  emptyStateMessage:
    'No presets yet. Create one to say how the network should look.',
};

export type NarrativePresetsSectionProps = Readonly<{
  copy?: Partial<NarrativePresetsCopy>;
}>;

/**
 * The ways of looking at the network this stage offers.
 *
 * The stage's `presets` and nothing else. Every preset describes the stage's
 * own subject — which of its attributes position the nodes, group them and
 * highlight them — so there is nothing to build until a subject is chosen, and
 * the section says so rather than offering pickers with nothing in them.
 *
 * Rows are addressed by their own id rather than by the index they were drawn
 * at, so an insertion, a removal or a reorder is committed as the operation it
 * was and survives being replayed onto a list a collaborator has since
 * changed.
 */
export default function NarrativePresetsSection({
  copy,
}: NarrativePresetsSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const subject = useStageSubject();
  const waiting = subject === undefined;
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    NarrativePresetFields,
    NarrativePresetPreview,
  );

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={waiting ? words.waitingDescription : words.description}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PRESETS_FIELD}
        label={words.fieldLabel}
        hint={words.fieldHint}
        component={DialogArrayField}
        addButtonLabel={words.addButtonLabel}
        addTitle={words.addTitle}
        editorTitle={words.editorTitle}
        itemLabel={words.itemLabel}
        emptyStateMessage={words.emptyStateMessage}
        editorFieldsComponent={editorFieldsComponent}
        previewComponent={previewComponent}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        sortable
        {...presetsValidation}
      />
    </BuilderSection>
  );
}
