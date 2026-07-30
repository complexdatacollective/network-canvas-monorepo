import Heading from '@codaco/fresco-ui/typography/Heading';

import EntityBadge from './EntityBadge';
import Variables from './Variables';
type EntityProps = {
  type?: string;
  entity?: string;
  variables?: Record<string, unknown>;
};
const Entity = ({ type, entity, variables }: EntityProps) => (
  <div
    className="page-break-marker flex break-before-page flex-col gap-6"
    id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}
  >
    {entity !== 'ego' && type && entity && (
      <EntityBadge type={type} entity={entity} iconSize="tiny" />
    )}

    {entity === 'ego' && <Heading level="h1">Ego</Heading>}

    <Variables variables={variables} />
  </div>
);
export default Entity;
