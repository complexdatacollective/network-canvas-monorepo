import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_AUTHOR_LABELS, FRAMING_IDS } from '@codaco/shared-consts';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

const FRAMING_MODE_OPTIONS = [
  { value: 'fixed', label: 'Fixed framing' },
  { value: 'participantChoice', label: 'Let the participant choose' },
];
const FRAMING_VALUE_OPTIONS = FRAMING_IDS.map((value) => ({
  value,
  label: FRAMING_AUTHOR_LABELS[value],
}));

const FramingConfig = (_props: StageEditorSectionProps) => {
  // `framing.value` only ever registers while the mode field is 'fixed' (it is
  // conditionally rendered below), so its dormant value drops out of
  // getFormValues() the moment the mode switches away — the discriminated
  // union's `participantChoice` variant carries no `value` key, matching the
  // schema without an explicit clear.
  const mode = useStageFormValue<string>('framing.mode') ?? 'fixed';
  const modeInitial = useStageInitialValue<string>('framing.mode');
  const valueInitial = useStageInitialValue<string>('framing.value');

  return (
    <Section
      title="Pedigree framing"
      description="Choose fixed terminology or let each participant select their preferred framing."
    >
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
      <ArchitectField
        name="framing.mode"
        component={RadioGroupField}
        label="Framing mode"
        initialValue={modeInitial}
        options={FRAMING_MODE_OPTIONS}
      />

      {mode === 'fixed' && (
        <div className="mt-5">
          <ArchitectField
            name="framing.value"
            component={NativeSelectField}
            label="Fixed framing terminology"
            // Falls back to the canonical default so switching from
            // participantChoice to fixed always registers a valid value —
            // the enhancer's old `handleModeChange` default.
            initialValue={valueInitial ?? 'gamete'}
            options={FRAMING_VALUE_OPTIONS}
          />
        </div>
      )}
    </Section>
  );
};
export default FramingConfig;
