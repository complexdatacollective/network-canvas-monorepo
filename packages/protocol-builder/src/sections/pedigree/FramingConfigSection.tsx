import { get } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

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

const MODE_FIELD = 'framing.mode';
const VALUE_FIELD = 'framing.value';

/** The framing a stage falls back to, and the schema's own canonical one. */
const DEFAULT_FRAMING: FramingId = 'gamete';

const FRAMING_MODE_OPTIONS = [
  { value: 'fixed', label: 'Fixed framing' },
  { value: 'participantChoice', label: 'Let the participant choose' },
];

/**
 * Author-facing names for each framing. The framing ids are schema contract;
 * these labels are editor copy, so they live with the editor that shows them.
 * The participant-facing terminology each framing selects lives in the
 * interview runtime.
 */
const FRAMING_AUTHOR_LABELS: Readonly<Record<FramingId, string>> =
  Object.freeze({
    gamete: 'Gamete-based',
    gendered: 'Gendered',
  });

const FRAMING_VALUE_OPTIONS = FRAMING_IDS.map((value) => ({
  value,
  label: FRAMING_AUTHOR_LABELS[value],
}));

export type FramingConfigCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  modeLabel: string;
  valueLabel: string;
}>;

const DEFAULT_COPY: FramingConfigCopy = {
  sectionTitle: 'Pedigree framing',
  description:
    'Choose fixed terminology or let each participant select their preferred framing.',
  modeLabel: 'Framing mode',
  valueLabel: 'Fixed framing terminology',
};

export type FramingConfigSectionProps = Readonly<{
  copy?: Partial<FramingConfigCopy>;
}>;

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
export default function FramingConfigSection({
  copy,
}: FramingConfigSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
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

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <Paragraph>
        The framing determines the language the interface uses when talking
        about biological parents:
      </Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        <li>
          <strong>Gamete-based</strong> — describes each parent by their
          reproductive contribution, using terms such as &ldquo;egg
          parent&rdquo; and &ldquo;sperm parent&rdquo; and questions such as
          &ldquo;Who provided the egg?&rdquo;. This framing works for all family
          structures, including donor conception, surrogacy, and same-sex
          parents.
        </li>
        <li>
          <strong>Gendered</strong> — uses gendered kinship terms such as
          &ldquo;mother&rdquo; and &ldquo;father&rdquo; and questions such as
          &ldquo;Who is the biological mother?&rdquo;. This framing assumes that
          each child has a mother and a father.
        </li>
      </ul>
      <Paragraph className="mb-5">
        Both framings use the same wording for gestational carriers and donors.
      </Paragraph>
      <ProtocolField<typeof RadioGroupField>
        name={MODE_FIELD}
        component={RadioGroupField}
        label={words.modeLabel}
        initialValue={
          typeof committedMode === 'string' ? committedMode : 'fixed'
        }
        options={FRAMING_MODE_OPTIONS}
        required
      />
      {isFixed && (
        <ProtocolField<typeof NativeSelectField>
          name={VALUE_FIELD}
          component={NativeSelectField}
          label={words.valueLabel}
          // Falls back to the canonical framing so switching back from a
          // participant choice always registers a value the union accepts.
          initialValue={
            typeof committedValue === 'string'
              ? committedValue
              : DEFAULT_FRAMING
          }
          options={FRAMING_VALUE_OPTIONS}
          required
        />
      )}
    </BuilderSection>
  );
}
