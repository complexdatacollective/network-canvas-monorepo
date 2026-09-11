import { get } from 'es-toolkit/compat';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_IDS, type FramingId } from '@codaco/protocol-validation';

import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useStageValue,
} from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { pedigreeMessages } from './pedigreeMessages.ts';

const MODE_FIELD = 'framing.mode';
const VALUE_FIELD = 'framing.value';

/** The framing a stage falls back to, and the schema's own canonical one. */
const DEFAULT_FRAMING: FramingId = 'gamete';

/**
 * The two modes, keyed by the schema value each option writes.
 *
 * Descriptors rather than words, so the pair a researcher reads is resolved
 * beside the control instead of at module load — a label resolved here would
 * be whatever language happened to be current when this file was first
 * imported, and would never change again.
 */
const FRAMING_MODE_LABELS: Readonly<Record<string, MessageDescriptor>> =
  Object.freeze({
    fixed: pedigreeMessages.framingModeFixed,
    participantChoice: pedigreeMessages.framingModeParticipantChoice,
  });

/**
 * Author-facing names for each framing. The framing ids are schema contract;
 * these labels are editor copy, so they live with the editor that shows them.
 * The participant-facing terminology each framing selects lives in the
 * interview runtime.
 */
const FRAMING_AUTHOR_LABELS: Readonly<Record<FramingId, MessageDescriptor>> =
  Object.freeze({
    gamete: pedigreeMessages.framingGamete,
    gendered: pedigreeMessages.framingGendered,
  });

/** The framing name inside an explanation, drawn as the emphasis it is. */
const boldTerm = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * The language the pedigree uses when it talks about biological parents.
 *
 * The schema holds this as a discriminated union: a fixed framing carries the
 * chosen terminology, and a participant choice carries nothing at all. The
 * terminology field is therefore rendered only while the mode is fixed, AND
 * thrown away when it is not — hiding it alone would leave the value parked,
 * and a parked value is written back on save, putting a key into the stage
 * that the union's `participantChoice` branch has no room for.
 *
 * Thrown away out of the DOCUMENT, and in the same write as the mode that
 * caused it. The document is the single notion of what a path holds: it is
 * what every field is seeded from as it mounts, so a clear that lived only in
 * the form would hand the old terminology back the moment the researcher
 * returned to a fixed framing.
 *
 * Coming BACK is its own act, and it puts the committed terminology back —
 * or the canonical framing, for a stage that was saved as a participant
 * choice. A round trip through the other branch is not a decision to stop
 * using the words the stage already uses, and leaving the control empty
 * refused the save of a stage the researcher had changed nothing about. The
 * value is written here rather than left to the control's own `initialValue`
 * because the discard tombstones the form field, and a tombstone is exactly
 * what stops a re-registering control from taking its initial value.
 */
export default function FramingConfigSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const chosenMode = useStageValue(MODE_FIELD);
  const mode = chosenMode ?? 'fixed';
  const discardStageValues = useDiscardStageValues();
  const { storeApi } = useStageEditorForm();
  const isFixed = mode === 'fixed';
  // The AGREED framing, not the live one: an initial value that moved with the
  // control would re-register the field on every change.
  const committedMode: unknown = get(committedFields, MODE_FIELD);
  const committedValue: unknown = get(committedFields, VALUE_FIELD);
  /**
   * What a fixed framing says, here and on every return to it.
   *
   * Read once, from the stage as the editor opened it. The discard below
   * writes the mode change structurally, and the terminology it threw away is
   * gone from the document by the time the researcher comes back — so a value
   * read again at that point would only ever be the canonical framing, and a
   * stage saved as gendered would silently return as gamete.
   */
  const seededValueRef = useRef(
    typeof committedValue === 'string' ? committedValue : DEFAULT_FRAMING,
  );
  const seededValue = seededValueRef.current;

  const wasFixed = useRef(isFixed);
  useEffect(() => {
    const leaving = wasFixed.current && !isFixed;
    const returning = !wasFixed.current && isFixed;
    wasFixed.current = isFixed;
    // Only the researcher LEAVING the fixed branch throws anything away. The
    // first render is a stage being opened on what it was saved with, which
    // already has whatever terminology belongs to its own framing.
    if (leaving) {
      // The mode in front of the terminology it cost, in one write, so the
      // document never holds half a framing.
      discardStageValues([VALUE_FIELD], {
        path: MODE_FIELD,
        value: chosenMode,
      });
      return;
    }
    if (!returning) return;
    storeApi.getState().setFieldValue(VALUE_FIELD, seededValue);
  }, [chosenMode, discardStageValues, isFixed, seededValue, storeApi]);

  const modeOptions = useMemo(
    () =>
      Object.entries(FRAMING_MODE_LABELS).map(([value, label]) => ({
        value,
        label: intl.formatMessage(label),
      })),
    [intl],
  );
  const framingOptions = useMemo(
    () =>
      FRAMING_IDS.map((value) => ({
        value,
        label: intl.formatMessage(FRAMING_AUTHOR_LABELS[value]),
      })),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.framingTitle)}
      description={intl.formatMessage(pedigreeMessages.framingDescription)}
    >
      <Paragraph>{intl.formatMessage(pedigreeMessages.framingIntro)}</Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        {/*
          Each bullet is ONE message with the framing's name marked inside it,
          rather than a bold fragment glued to a sentence: a translator moves
          the emphasis to wherever their language puts the term.
        */}
        <li>
          {intl.formatMessage(pedigreeMessages.framingGameteExplanation, {
            term: boldTerm,
          })}
        </li>
        <li>
          {intl.formatMessage(pedigreeMessages.framingGenderedExplanation, {
            term: boldTerm,
          })}
        </li>
      </ul>
      <Paragraph className="mb-5">
        {intl.formatMessage(pedigreeMessages.framingSharedWording)}
      </Paragraph>
      <Field<typeof RadioGroupField>
        name={MODE_FIELD}
        component={RadioGroupField}
        label={intl.formatMessage(pedigreeMessages.framingModeLabel)}
        initialValue={
          typeof committedMode === 'string' ? committedMode : 'fixed'
        }
        options={modeOptions}
        required={REQUIRED}
      />
      {isFixed && (
        <Field<typeof NativeSelectField>
          name={VALUE_FIELD}
          component={NativeSelectField}
          label={intl.formatMessage(pedigreeMessages.framingValueLabel)}
          // Falls back to the canonical framing so a stage saved as a
          // participant choice registers a value the union accepts.
          initialValue={seededValue}
          options={framingOptions}
          required={REQUIRED}
        />
      )}
    </BuilderSection>
  );
}
