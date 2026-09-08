import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';

import EntityBadge from './EntityBadge';
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
  variables?: Record<string, unknown>;
};
const Entity = ({ type, entity, variables }: EntityProps) => {
  const intl = useAppIntl();
  return (
    <div
      className="page-break-marker flex break-before-page flex-col gap-6"
      id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}
    >
      {entity !== 'ego' && type && entity && (
        <EntityBadge type={type} entity={entity} iconSize="tiny" />
      )}

      {entity === 'ego' && (
        <Heading level="h1">{intl.formatMessage(messages.ego)}</Heading>
      )}

      <Variables variables={variables} />
    </div>
  );
};
export default Entity;
