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
    className="page-break-marker mb-14 break-before-page"
    id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}
  >
    {entity !== 'ego' && type && entity && (
      <EntityBadge type={type} entity={entity} />
    )}

    {entity === 'ego' && (
      <div>
        <Heading level="h1">Ego</Heading>
      </div>
    )}

    <div className="mt-10">
      <Variables variables={variables} />
    </div>
  </div>
);
export default Entity;
