import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import BuilderSection from '../BuilderSection.tsx';
import { canvasBehavioursMessages } from './canvasBehavioursMessages.ts';
import LayoutModeField from './LayoutModeField.tsx';

const AUTOMATIC_LAYOUT_FIELD = 'behaviours.automaticLayout';

/**
 * How the stage arranges nodes when it opens.
 *
 * `behaviours.automaticLayout` and nothing else. An absent value is Manual
 * mode rather than Automatic: opting a protocol into a force simulation nobody
 * asked for would change what its participants see.
 */
export default function NodeLayoutSection() {
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
      />
    </BuilderSection>
  );
}
