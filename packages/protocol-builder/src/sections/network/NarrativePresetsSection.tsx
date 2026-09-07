import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

/**
 * Encoded rather than formatted, because the rule below is registered with the
 * form store rather than rendered here. `FormErrors` decodes it in the
 * reader's own language where the refusal is shown.
 */
const AT_LEAST_ONE_PRESET = createMessageError(
  networkCanvasMessages.presetsAtLeastOne,
);

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
export default function NarrativePresetsSection() {
  const intl = useAppIntl();
  const subject = useStageSubject();
  const waiting = subject === undefined;
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    NarrativePresetFields,
    NarrativePresetPreview,
  );

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.presetsTitle)}
      description={intl.formatMessage(
        waiting
          ? networkCanvasMessages.presetsWaitingDescription
          : networkCanvasMessages.presetsDescription,
      )}
      disabled={waiting}
    >
      <ProtocolArrayField<typeof DialogArrayField>
        name={PRESETS_FIELD}
        label={intl.formatMessage(networkCanvasMessages.presetsFieldLabel)}
        hint={intl.formatMessage(networkCanvasMessages.presetsFieldHint)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(
          networkCanvasMessages.presetsAddLabel,
        )}
        addTitle={intl.formatMessage(networkCanvasMessages.presetsAddTitle)}
        editorTitle={intl.formatMessage(networkCanvasMessages.presetsEditTitle)}
        itemLabel={networkCanvasMessages.presetNoun}
        emptyStateMessage={intl.formatMessage(
          networkCanvasMessages.presetsEmptyState,
        )}
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
