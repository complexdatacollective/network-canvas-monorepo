import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';

const FREE_DRAW_FIELD = 'behaviours.freeDraw';
const ALLOW_REPOSITIONING_FIELD = 'behaviours.allowRepositioning';

export type NarrativeBehavioursCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  freeDrawLabel: string;
  freeDrawHint: string;
  repositioningLabel: string;
  repositioningHint: string;
}>;

const DEFAULT_COPY: NarrativeBehavioursCopy = {
  sectionTitle: 'Canvas interaction',
  description:
    'Choose what the participant may do to the picture while they tell their story.',
  freeDrawLabel: 'Allow drawing on the canvas',
  freeDrawHint:
    'The participant can draw freehand annotations over the canvas, and erase them again.',
  repositioningLabel: 'Allow moving nodes',
  repositioningHint:
    'The participant can drag nodes to new positions. Their positions are stored in the attribute the preset uses for layout, so moving a node here changes it everywhere that attribute is used.',
};

export type NarrativeBehavioursSectionProps = Readonly<{
  copy?: Partial<NarrativeBehavioursCopy>;
}>;

/**
 * What the participant may do to the canvas.
 *
 * Two independent permissions the researcher grants or withholds — drawing on
 * the canvas, and moving what is on it — held at `behaviours.freeDraw` and
 * `behaviours.allowRepositioning`.
 *
 * Deliberately not the same section as the layout mode, which is not a
 * permission at all: it decides how the stage arranges nodes before the
 * participant touches anything, and it is offered by interfaces that grant
 * neither of these.
 */
export default function NarrativeBehavioursSection({
  copy,
}: NarrativeBehavioursSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof ToggleField>
        name={FREE_DRAW_FIELD}
        component={ToggleField}
        label={words.freeDrawLabel}
        hint={words.freeDrawHint}
        inline
      />
      <ProtocolField<typeof ToggleField>
        name={ALLOW_REPOSITIONING_FIELD}
        component={ToggleField}
        label={words.repositioningLabel}
        hint={words.repositioningHint}
        inline
      />
    </BuilderSection>
  );
}
