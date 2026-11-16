import { get } from 'es-toolkit/compat';
import { useContext } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import EntityIcon from '~/components/Codebook/EntityIcon';

import DualLink from './DualLink';
import SummaryContext from './SummaryContext';
type EntityBadgeProps = {
  type: string;
  entity: string;
  iconSize?: 'default' | 'small' | 'tiny';
  link?: boolean;
  small?: boolean;
  tiny?: boolean;
};
const EntityBadge = ({
  type,
  entity,
  iconSize,
  link = false,
  small = false,
  tiny = false,
}: EntityBadgeProps) => {
  const {
    protocol: { codebook },
  } = useContext(SummaryContext);
  const color = get(codebook, [entity, type, 'color']);
  const name = get(codebook, [entity, type, 'name']);
  const shape = get(codebook, [entity, type, 'shape', 'default']);
  const size = iconSize ?? (tiny ? 'tiny' : small ? 'small' : 'default');
  // The researcher's name for the type reads in its own direction.
  const ownName = <bdi>{name}</bdi>;
  const label =
    small || tiny ? ownName : <Heading level="h2">{ownName}</Heading>;
  const badge = (
    <EntityIcon
      color={color}
      entity={entity}
      shape={shape}
      label={label}
      size={size}
    />
  );
  if (!link) {
    return badge;
  }
  return <DualLink to={`#entity-${type}`}>{badge}</DualLink>;
};
export default EntityBadge;
