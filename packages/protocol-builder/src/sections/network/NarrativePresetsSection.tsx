import { useCallback, useMemo } from 'react';

import { createMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import { withoutAbsentValues } from '../../form/absentValues.ts';
import DialogArrayField from '../../form/arrayFields/DialogArrayField.tsx';
import ProtocolArrayField from '../../form/ProtocolArrayField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { useRowRenderers } from '../rowRenderers.tsx';
import {
  useEdgeTypeOptions,
  useStageSubject,
  useSubjectVariables,
} from './codebookOptions.ts';
import {
  NarrativePresetFields,
  NarrativePresetPreview,
} from './NarrativePresetFields.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import {
  presetHasUnusableReference,
  presetReferenceIssues,
} from './presetReferences.ts';
import { asText } from './rowValues.ts';

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
 *
 * Two gates decide whether a preset may be saved, and they are the same rule —
 * `presetReferenceIssues`, read against the LIVE codebook — asked in the two
 * places a preset can reach the protocol. `onBeforeSave` asks it of the row a
 * dialog is committing, and marks the control that holds the bad reference.
 * The list rule asks it of every row, because a row nobody opened goes through
 * no row gate at all: a collaborator retyping the attribute a preset positions
 * by, while the researcher is editing the section below, otherwise reached the
 * host unremarked — the schema checks that a reference exists, not what kind
 * of thing it is, so it accepted the stage and the interview quietly stopped
 * doing what the preset says.
 */
export default function NarrativePresetsSection() {
  const intl = useAppIntl();
  const subject = useStageSubject();
  const waiting = subject === undefined;
  const allVariables = useSubjectVariables(subject);
  const edgeOptions = useEdgeTypeOptions();
  const edgeTypes = useMemo(
    () => new Set(edgeOptions.map((option) => option.value)),
    [edgeOptions],
  );
  const { editorFieldsComponent, previewComponent } = useRowRenderers(
    NarrativePresetFields,
    NarrativePresetPreview,
  );

  const onBeforeSave = useCallback(
    (value: unknown) => {
      const fieldErrors = presetReferenceIssues(allVariables, edgeTypes, value);
      return Object.keys(fieldErrors).length === 0
        ? value
        : { success: false, fieldErrors };
    },
    [allVariables, edgeTypes],
  );

  /**
   * The presets holding a reference the protocol can no longer serve, by the
   * name the researcher gave them.
   *
   * A preset with no name of its own is named by the same stand-in its
   * collapsed row shows, carried as a nested message error so the whole
   * refusal is resolved in the reader's language where it is finally rendered.
   */
  const unusablePresetNames = useCallback(
    (value: unknown): (string | Readonly<{ messageError: string }>)[] => {
      if (!Array.isArray(value)) return [];
      return value.flatMap((row: unknown) =>
        presetHasUnusableReference(allVariables, edgeTypes, row)
          ? [
              asText(
                typeof row === 'object' && row !== null
                  ? Reflect.get(row, 'label')
                  : undefined,
              ) ?? {
                messageError: createMessageError(
                  networkCanvasMessages.presetUnnamedPreview,
                ),
              },
            ]
          : [],
      );
    },
    [allVariables, edgeTypes],
  );

  const presetsValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) =>
          Array.isArray(value) && value.length > 0
            ? undefined
            : AT_LEAST_ONE_PRESET,
        (value: unknown) => {
          const names = unusablePresetNames(value);
          return names.length === 0
            ? undefined
            : createMessageError(
                networkCanvasMessages.presetsUnusableReferences,
                { count: names.length, presetNames: { list: names } },
              );
        },
      ]),
    }),
    [unusablePresetNames],
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
        onBeforeSave={onBeforeSave}
        editorDialogSize="editor"
        normalizeItem={withoutAbsentValues}
        sortable
        {...presetsValidation}
      />
    </BuilderSection>
  );
}
