import { get } from 'es-toolkit/compat';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_IDS, type FramingId } from '@codaco/protocol-validation';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useStageValue,
} from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
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
 * imported, for the rest of the session.
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
 * Thrown away out of the SESSION, and in the same batch as the mode that
 * caused it. The draft is the single notion of what a path holds: it is what
 * every field is seeded from as it mounts, so a clear that lived only in the
 * form would hand the old terminology back the moment the researcher returned
 * to a fixed framing. And the mode has to travel with it, because a mode is an
 * ordinary field that waits for the submit that flushes it — sent alone, the
 * clear would reach a live-applying host as a pedigree still claiming a fixed
 * framing with no terminology to fix it to, which is a stage nobody authored
 * and one the union refuses.
 */
export default function FramingConfigSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const chosenMode = useStageValue(MODE_FIELD);
  const mode = chosenMode ?? 'fixed';
  const discardStageValues = useDiscardStageValues();
  const isFixed = mode === 'fixed';
  // The AGREED framing, not the live one: an initial value that moved with the
  // control would re-register the field on every change.
  const committedMode: unknown = get(committedFields, MODE_FIELD);
  const committedValue: unknown = get(committedFields, VALUE_FIELD);

  const wasFixed = useRef(isFixed);
  useEffect(() => {
    const leaving = wasFixed.current && !isFixed;
    wasFixed.current = isFixed;
    // Only the researcher LEAVING the fixed branch throws anything away. The
    // first render is a stage being opened on what it was saved with, and an
    // arrival that brings a participant choice with it — an undo, a redo, a
    // collaborator's change — has already left the terminology behind, so
    // there is nothing there for this to find.
    if (!leaving) return;
    // The mode in front of the terminology it cost, in one batch, so an undo
    // brings back a framing the union accepts rather than half of one.
    discardStageValues([VALUE_FIELD], {
      path: MODE_FIELD,
      value: chosenMode,
    });
  }, [chosenMode, discardStageValues, isFixed]);

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
      <ProtocolField<typeof RadioGroupField>
        name={MODE_FIELD}
        component={RadioGroupField}
        label={intl.formatMessage(pedigreeMessages.framingModeLabel)}
        initialValue={
          typeof committedMode === 'string' ? committedMode : 'fixed'
        }
        options={modeOptions}
        required
      />
      {isFixed && (
        <ProtocolField<typeof NativeSelectField>
          name={VALUE_FIELD}
          component={NativeSelectField}
          label={intl.formatMessage(pedigreeMessages.framingValueLabel)}
          // Falls back to the canonical framing so switching back from a
          // participant choice always registers a value the union accepts.
          initialValue={
            typeof committedValue === 'string'
              ? committedValue
              : DEFAULT_FRAMING
          }
          options={framingOptions}
          required
        />
      )}
    </BuilderSection>
  );
}
