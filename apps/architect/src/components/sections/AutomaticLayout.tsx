import type { ComponentProps } from 'react';

import RichSelectGroupField, {
  type RichSelectOption,
} from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const FIELD_PATH = 'behaviours.automaticLayout';

const MANUAL = 'manual';
const AUTOMATIC = 'automatic';

const LAYOUT_MODE_OPTIONS: RichSelectOption[] = [
  {
    value: MANUAL,
    label: 'Manual mode',
    description:
      'Places all nodes in a "bucket" at the bottom of the screen, from which the participant drags each one to where they want it.',
  },
  {
    value: AUTOMATIC,
    label: 'Automatic mode',
    description:
      'Positions nodes when the stage first opens by simulating physical forces such as attraction and repulsion. The participant can pause and resume the simulation, and reposition nodes by hand while it is paused.',
  },
];

type LayoutModeFieldProps = Omit<
  ComponentProps<typeof RichSelectGroupField>,
  'value' | 'onChange' | 'options'
> & {
  value?: boolean;
  onChange?: (value: boolean) => void;
};

/**
 * The stage stores this choice as a boolean, but the card group speaks option
 * values, so this field bridges the two — the fresco-ui form store has no
 * `format`/`parse` hook of its own.
 */
const LayoutModeField = ({
  value,
  onChange,
  ...props
}: LayoutModeFieldProps) => (
  <RichSelectGroupField
    {...props}
    options={LAYOUT_MODE_OPTIONS}
    value={value ? AUTOMATIC : MANUAL}
    onChange={(nextValue) => onChange?.(nextValue === AUTOMATIC)}
  />
);

const AutomaticLayout = () => {
  // Redux Form omitted an untouched field's value entirely; the interface
  // template seeds `true` for the interfaces that offer this choice, so an
  // absent committed value only happens for a protocol saved before this
  // field existed — fall back to Manual mode rather than silently opting in.
  const initialValue = useStageInitialValue<boolean>(FIELD_PATH) ?? false;

  return (
    <Section title="Layout Mode">
      <>
        <ArchitectField
          name={FIELD_PATH}
          label="Layout mode"
          hint="How Interviewer positions nodes on the sociogram when the stage opens."
          component={LayoutModeField}
          initialValue={initialValue}
          validation={{ required: true }}
        />
      </>
    </Section>
  );
};
export default AutomaticLayout;
