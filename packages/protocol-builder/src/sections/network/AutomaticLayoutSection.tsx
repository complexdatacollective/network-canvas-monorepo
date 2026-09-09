import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { LayoutModeField } from './canvasFields.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

export type AutomaticLayoutSectionProps = Readonly<{
  /**
   * The sentence under the manual-mode card, where an interface needs one of
   * its own.
   *
   * A DESCRIPTOR, and named on its own rather than bundled behind a `copy`
   * object — see `src/__tests__/hostCopyOverrides.test.ts`. A string handed
   * across a seam like this is invisible to extraction, absent from the
   * catalogs and covered by no guard, so the words an interface cared enough
   * to write for itself would be the only words that stayed English.
   *
   * Only this one, because only this one says something the interfaces decide
   * differently. Manual mode on a stage that COLLECTS positions leaves every
   * node in a bucket at the foot of the canvas for the participant to place; a
   * narrative stage collects nothing and shows the positions the preset's
   * attribute already holds, so the shared sentence describes the opposite
   * starting state. Automatic mode is the same simulation on both.
   */
  manualDescription?: MessageDescriptor;
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
  manualDescription = networkCanvasMessages.layoutModeManualDescription,
}: AutomaticLayoutSectionProps = {}) {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(networkCanvasMessages.nodeLayoutTitle)}
      description={intl.formatMessage(
        networkCanvasMessages.nodeLayoutDescription,
      )}
    >
      <ProtocolField<typeof LayoutModeField>
        name={AUTOMATIC_LAYOUT_FIELD}
        component={LayoutModeField}
        label={intl.formatMessage(networkCanvasMessages.layoutModeLabel)}
        hint={intl.formatMessage(networkCanvasMessages.layoutModeHint)}
        manualDescription={intl.formatMessage(manualDescription)}
      />
    </BuilderSection>
  );
}
