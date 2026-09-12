import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';

import BuilderSection from '../../../../sections/BuilderSection.tsx';

const FREE_DRAW_FIELD = 'behaviours.freeDraw';
const ALLOW_REPOSITIONING_FIELD = 'behaviours.allowRepositioning';

const messages = defineMessages({
  canvasInteractionTitle: {
    id: 'protocolBuilder.networkCanvas.canvasInteractionTitle',
    defaultMessage: 'Narrative behaviors',
    description:
      'Heading of the section granting or withholding what the participant may do to the canvas. Also names the section in the editor outline and to assistive technology.',
  },
  canvasInteractionDescription: {
    id: 'protocolBuilder.networkCanvas.canvasInteractionDescription',
    defaultMessage:
      'Control automatic layout, drawing, and node repositioning on the narrative canvas.',
    description:
      'Description of the canvas-interaction section on a narrative stage, where the participant is shown the network they have already built and asked to talk about it.',
  },
  freeDrawLabel: {
    id: 'protocolBuilder.networkCanvas.freeDrawLabel',
    defaultMessage: 'Free-draw',
    description:
      'Label of the switch letting the participant draw on the canvas.',
  },
  freeDrawHint: {
    id: 'protocolBuilder.networkCanvas.freeDrawHint',
    defaultMessage: 'Allow drawing on the canvas',
    description: 'Guidance under the drawing switch.',
  },
  repositioningLabel: {
    id: 'protocolBuilder.networkCanvas.repositioningLabel',
    defaultMessage: 'Allow repositioning',
    description:
      'Label of the switch letting the participant drag the network members around the canvas.',
  },
  repositioningHint: {
    id: 'protocolBuilder.networkCanvas.repositioningHint',
    defaultMessage: 'Allow nodes to be repositioned',
    description:
      'Guidance under the moving-nodes switch on a narrative stage, restating in the researcher’s words what the switch grants the participant.',
  },
});

/**
 * What the participant may do to the canvas while they talk over it.
 *
 * Two independent permissions, held at `behaviours.freeDraw` and
 * `behaviours.allowRepositioning`. Deliberately not the same section as the
 * layout mode, which is not a permission at all: that decides how the stage
 * arranges nodes before the participant touches anything, and it is offered by
 * interfaces that grant neither of these.
 *
 * The narrative interface is the only one of the nineteen that honours either,
 * so this section lives with it. `Sociogram.tsx` reads no drawing flag and
 * repositions unconditionally, and the network composer's `behaviours` holds
 * `automaticLayout` alone.
 */
export default function CanvasPermissionsSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.canvasInteractionTitle)}
      description={intl.formatMessage(messages.canvasInteractionDescription)}
    >
      <Field<typeof ToggleField>
        name={FREE_DRAW_FIELD}
        component={ToggleField}
        label={intl.formatMessage(messages.freeDrawLabel)}
        hint={intl.formatMessage(messages.freeDrawHint)}
        inline
      />
      <Field<typeof ToggleField>
        name={ALLOW_REPOSITIONING_FIELD}
        component={ToggleField}
        label={intl.formatMessage(messages.repositioningLabel)}
        hint={intl.formatMessage(messages.repositioningHint)}
        inline
      />
    </BuilderSection>
  );
}
