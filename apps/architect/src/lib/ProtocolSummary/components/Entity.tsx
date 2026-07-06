import EntityBadge from './EntityBadge';
import Variables from './Variables';

type EntityProps = {
  type?: string;
  entity?: string;
  variables?: Record<string, unknown>;
};

const Entity = ({ type, entity, variables }: EntityProps) => (
  <div
    className="page-break-marker mb-(--space-2xl) break-before-page"
    id={entity === 'ego' ? 'ego' : `entity-${type ?? ''}`}
  >
    {entity !== 'ego' && type && entity && (
      <EntityBadge type={type} entity={entity} />
    )}

    {entity === 'ego' && (
      <div>
        <h1>Ego</h1>
      </div>
    )}

    <div className="mt-(--space-xl)">
      <Variables variables={variables} />
    </div>
  </div>
);

export default Entity;
