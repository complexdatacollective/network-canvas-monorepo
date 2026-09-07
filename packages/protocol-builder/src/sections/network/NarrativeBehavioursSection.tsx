import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

const FREE_DRAW_FIELD = 'behaviours.freeDraw';
const ALLOW_REPOSITIONING_FIELD = 'behaviours.allowRepositioning';

export type NarrativeBehavioursSectionProps = Readonly<{
  /**
   * Sentences an interface needs instead of the narrative ones.
   *
   * DESCRIPTORS, and named one at a time rather than bundled behind a `copy`
   * object — see `src/__tests__/hostCopyOverrides.test.ts`. A string handed
   * across a seam like this is invisible to extraction, absent from the
   * catalogs and covered by no guard, so the words an interface cared enough
   * to write for itself would be the only words that stayed English.
   *
   * Only these two, because only these two say something the interface decides
   * differently: a narrative stage reads each node's position out of the
   * PRESET the researcher is talking through, and a sociogram out of the
   * PROMPT the participant is answering, so the sentence about where a moved
   * node ends up is not the same sentence with a noun changed. The two
   * switches, their labels and the drawing hint mean exactly the same thing on
   * both, and are deliberately not overridable.
   */
  description?: MessageDescriptor;
  /** Said instead of the narrative wording under the moving-nodes switch. */
  repositioningHint?: MessageDescriptor;
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
  description = networkCanvasMessages.canvasInteractionDescription,
  repositioningHint = networkCanvasMessages.repositioningHint,
}: NarrativeBehavioursSectionProps) {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.canvasInteractionTitle)}
      description={intl.formatMessage(description)}
    >
      <ProtocolField<typeof ToggleField>
        name={FREE_DRAW_FIELD}
        component={ToggleField}
        label={intl.formatMessage(networkCanvasMessages.freeDrawLabel)}
        hint={intl.formatMessage(networkCanvasMessages.freeDrawHint)}
        inline
      />
      <ProtocolField<typeof ToggleField>
        name={ALLOW_REPOSITIONING_FIELD}
        component={ToggleField}
        label={intl.formatMessage(networkCanvasMessages.repositioningLabel)}
        hint={intl.formatMessage(repositioningHint)}
        inline
      />
    </BuilderSection>
  );
}
