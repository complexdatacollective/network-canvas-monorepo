import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import { FRAMING_AUTHOR_LABELS, type FramingId } from '@codaco/shared-consts';
import { Section } from '~/components/EditorLayout';
import RadioGroup from '~/components/Form/Fields/RadioGroup';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/store';

type FramingValue =
  | { mode: 'fixed'; value: FramingId }
  | { mode: 'participantChoice' };

const FRAMING_MODE_OPTIONS = [
  { value: 'fixed', label: 'Fixed framing' },
  { value: 'participantChoice', label: 'Let the participant choose' },
];

const FRAMING_VALUE_OPTIONS = (
  Object.entries(FRAMING_AUTHOR_LABELS) as [FramingId, string][]
).map(([value, label]) => ({ value, label }));

const FramingConfig = ({ form }: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const formSelector = formValueSelector(form);

  const framing = useSelector(
    (state: RootState) =>
      formSelector(state, 'framing') as FramingValue | undefined,
  );

  const mode = framing?.mode ?? 'fixed';
  const fixedValue =
    framing?.mode === 'fixed' ? framing.value : ('gamete' as FramingId);

  const handleModeChange = (newMode: unknown) => {
    if (newMode === 'participantChoice') {
      dispatch(change(form, 'framing', { mode: 'participantChoice' }));
    } else {
      dispatch(change(form, 'framing', { mode: 'fixed', value: 'gamete' }));
    }
  };

  const handleValueChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(change(form, 'framing.value', event.target.value));
  };

  return (
    <Section
      title="Framing Configuration"
      summary={
        <p>
          Choose how the pedigree interface is framed for participants. Fixed
          framing uses a single consistent terminology, while participant choice
          allows each participant to select the framing that suits them.
        </p>
      }
    >
      <RadioGroup
        options={FRAMING_MODE_OPTIONS}
        input={{
          value: mode,
          name: 'framing.mode',
          onChange: handleModeChange,
        }}
      />

      {mode === 'fixed' && (
        <div className="mt-(--space-md)">
          <select
            value={fixedValue}
            onChange={handleValueChange}
            aria-label="Select framing"
          >
            {FRAMING_VALUE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
};

export default FramingConfig;
