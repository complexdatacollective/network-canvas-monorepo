import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { LayoutModeField } from './canvasFields.tsx';

const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

export type AutomaticLayoutCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
}>;

const DEFAULT_COPY: AutomaticLayoutCopy = {
  sectionTitle: 'Node layout',
  description: 'Choose how nodes are arranged when this stage opens.',
  fieldLabel: 'Layout mode',
  fieldHint:
    'How the stage arranges nodes before the participant moves any of them.',
};

export type AutomaticLayoutSectionProps = Readonly<{
  copy?: Partial<AutomaticLayoutCopy>;
}>;

/**
 * How the stage arranges nodes when it opens.
 *
 * `behaviours.automaticLayout` and nothing else. An absent value is Manual
 * mode rather than Automatic: the interfaces that offer this choice seed it
 * when a stage is created, so a stage arriving without it was authored before
 * the choice existed — and opting a protocol into a force simulation nobody
 * asked for would change what its participants see.
 */
export default function AutomaticLayoutSection({
  copy,
}: AutomaticLayoutSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof LayoutModeField>
        name={AUTOMATIC_LAYOUT_FIELD}
        component={LayoutModeField}
        label={words.fieldLabel}
        hint={words.fieldHint}
      />
    </BuilderSection>
  );
}
