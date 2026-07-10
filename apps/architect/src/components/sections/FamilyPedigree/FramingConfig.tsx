import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  FRAMING_AUTHOR_LABELS,
  FRAMING_IDS,
  type FramingId,
} from '@codaco/shared-consts';
import { Section } from '~/components/EditorLayout';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';
type FramingValue =
  | {
      mode: 'fixed';
      value: FramingId;
    }
  | {
      mode: 'participantChoice';
    };
const FRAMING_MODE_OPTIONS = [
  { value: 'fixed', label: 'Fixed framing' },
  { value: 'participantChoice', label: 'Let the participant choose' },
];
const FRAMING_VALUE_OPTIONS = FRAMING_IDS.map((value) => ({
  value,
  label: FRAMING_AUTHOR_LABELS[value],
}));
const FramingConfig = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);
  const framing = useSelector(
    (state: RootState) =>
      formSelector(state, 'framing') as FramingValue | undefined,
  );
  const mode = framing?.mode ?? 'fixed';
  const fixedValue: FramingId =
    framing?.mode === 'fixed' ? framing.value : 'gamete';
  const handleModeChange = (newMode: unknown) => {
    if (newMode === 'participantChoice') {
      dispatch(change(form, 'framing', { mode: 'participantChoice' }));
    } else {
      dispatch(change(form, 'framing', { mode: 'fixed', value: 'gamete' }));
    }
  };
  const handleValueChange = (value: string | number | undefined) => {
    if (typeof value === 'string') {
      dispatch(change(form, 'framing.value', value));
    }
  };
  return (
    <Section
      title="Framing Configuration"
      summary={
        <Paragraph>
          Choose how the pedigree interface is framed for participants. Fixed
          framing uses a single consistent terminology, while participant choice
          allows each participant to select the framing that suits them.
        </Paragraph>
      }
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
      <RadioGroupField
        options={FRAMING_MODE_OPTIONS}
        name="framing.mode"
        value={mode}
        onChange={handleModeChange}
      />

      {mode === 'fixed' && (
        <div className="mt-5">
          <NativeSelectField
            aria-label="Select framing"
            options={FRAMING_VALUE_OPTIONS}
            name="framing.value"
            value={fixedValue}
            onChange={handleValueChange}
          />
        </div>
      )}
    </Section>
  );
};
export default FramingConfig;
