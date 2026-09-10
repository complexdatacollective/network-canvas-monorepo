import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import BuilderSection from '../BuilderSection.tsx';
import { canvasBehavioursMessages } from './canvasBehavioursMessages.ts';
import LayoutModeField from './LayoutModeField.tsx';

const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

export type NodeLayoutSectionProps = Readonly<{
  /**
   * The sentence under the manual-mode card, where an interface needs one of
   * its own.
   *
   * A DESCRIPTOR, and named on its own rather than bundled behind a `copy`
   * object — see `src/__tests__/hostCopyOverrides.test.ts`. A string handed
   * across a seam like this is invisible to extraction, absent from the
   * catalogs and covered by no guard.
   *
   * Manual mode on a stage that COLLECTS positions leaves every node in a
   * bucket at the foot of the canvas for the participant to place; a narrative
   * stage collects nothing and shows the positions the preset's attribute
   * already holds.
   *
   * Absent means the shared wording, which the control itself supplies: the
   * default lives with the card it is written on and nowhere else.
   */
  manualDescription?: MessageDescriptor;
  /**
   * The same, for the automatic-mode card.
   *
   * The force simulation is one implementation, but two things about it differ
   * by interface, and both are things the card promises. It runs over the
   * nodes the interface hands it, and a narrative stage hands it only the
   * nodes the preset's attribute holds a position for — `Narrative.tsx`
   * simulates `nodesWithLayout` in either mode, where `Sociogram.tsx` switches
   * to `allNodes` in automatic mode and draws the unplaced ones in. And moving
   * a node by hand is unconditional on a sociogram, while a narrative stage
   * passes `behaviours.allowRepositioning` down to the canvas, so the "Allow
   * moving nodes" switch withdraws it in both modes.
   *
   * A network composer differs again, and about the setting rather than about
   * the simulation: there, automatic layout is where the stage STARTS and the
   * participant switches it off and on for themselves, which the shared
   * sentence — a simulation the stage runs when it opens — does not say.
   */
  automaticDescription?: MessageDescriptor;
}>;

/**
 * How the stage arranges nodes when it opens.
 *
 * `behaviours.automaticLayout` and nothing else. An absent value is Manual
 * mode rather than Automatic: opting a protocol into a force simulation nobody
 * asked for would change what its participants see.
 */
export default function NodeLayoutSection({
  manualDescription,
  automaticDescription,
}: NodeLayoutSectionProps) {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(canvasBehavioursMessages.nodeLayoutTitle)}
      description={intl.formatMessage(
        canvasBehavioursMessages.nodeLayoutDescription,
      )}
    >
      <Field<typeof LayoutModeField>
        name={AUTOMATIC_LAYOUT_FIELD}
        component={LayoutModeField}
        label={intl.formatMessage(canvasBehavioursMessages.layoutModeLabel)}
        hint={intl.formatMessage(canvasBehavioursMessages.layoutModeHint)}
        {...(manualDescription === undefined
          ? {}
          : { manualDescription: intl.formatMessage(manualDescription) })}
        {...(automaticDescription === undefined
          ? {}
          : { automaticDescription: intl.formatMessage(automaticDescription) })}
      />
    </BuilderSection>
  );
}
