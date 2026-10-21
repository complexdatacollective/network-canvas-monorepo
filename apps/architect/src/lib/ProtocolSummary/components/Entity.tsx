import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from './EntityBadge';
import MiniTable from './MiniTable';
import { SummaryText } from './SummaryText';
import Variables from './Variables';
const messages = defineMessages({
  ego: {
    id: 'architect.protocolSummary.entity.ego',
    defaultMessage: 'Ego',
    description: 'Visible text in lib / ProtocolSummary / components / Entity.',
  },
});

type EntityProps = {
  type?: string;
  entity?: string;
  label?: LocalizedString;
  variables?: Record<string, unknown>;
};
const Entity = ({ type, entity, label, variables }: EntityProps) => {
  const intl = useAppIntl();
  return (
    <div
      // oxlint-disable-next-line tailwindcss/no-unknown-classes -- print stylesheet + e2e selector hook
      className="page-break-marker flex break-before-page flex-col gap-6"
      id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}
    >
      {entity !== 'ego' && type && entity && (
        <EntityBadge type={type} entity={entity} iconSize="tiny" />
      )}

      {label && (
        <MiniTable
          rotated
          rows={[
            [
              intl.formatMessage(summaryMessages.label),
              <SummaryText key="label" value={label} />,
            ],
          ]}
        />
      )}

      {entity === 'ego' && (
        <Heading level="h1">{intl.formatMessage(messages.ego)}</Heading>
      )}

      <Variables variables={variables} />
    </div>
  );
};
export default Entity;
