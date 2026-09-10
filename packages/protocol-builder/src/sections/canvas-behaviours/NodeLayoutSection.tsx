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
   * Only this one, because only this one says something the interfaces decide
   * differently. Manual mode on a stage that COLLECTS positions leaves every
   * node in a bucket at the foot of the canvas for the participant to place; a
   * narrative stage collects nothing and shows the positions the preset's
   * attribute already holds. Automatic mode is the same simulation on both.
   */
  manualDescription?: MessageDescriptor;
}>;

/**
 * How the stage arranges nodes when it opens.
 *
 * `behaviours.automaticLayout` and nothing else. An absent value is Manual
 * mode rather than Automatic: opting a protocol into a force simulation nobody
 * asked for would change what its participants see.
 *
 * Deliberately not the same section as the canvas permissions, which are not
 * about arrangement at all: this decides what the participant is shown before
 * they touch anything, and it is offered by interfaces that grant no
 * permissions whatever.
 */
export default function NodeLayoutSection({
  manualDescription = canvasBehavioursMessages.layoutModeManualDescription,
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
        manualDescription={intl.formatMessage(manualDescription)}
      />
    </BuilderSection>
  );
}
