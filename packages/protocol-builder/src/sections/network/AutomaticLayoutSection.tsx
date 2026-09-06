import { useAppIntl } from '@codaco/app-i18n/react';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { LayoutModeField } from './canvasFields.tsx';
import { networkCanvasMessages } from './networkCanvasMessages.ts';

const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

/**
 * How the stage arranges nodes when it opens.
 *
 * `behaviours.automaticLayout` and nothing else. An absent value is Manual
 * mode rather than Automatic: the interfaces that offer this choice seed it
 * when a stage is created, so a stage arriving without it was authored before
 * the choice existed — and opting a protocol into a force simulation nobody
 * asked for would change what its participants see.
 */
export default function AutomaticLayoutSection() {
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
      />
    </BuilderSection>
  );
}
