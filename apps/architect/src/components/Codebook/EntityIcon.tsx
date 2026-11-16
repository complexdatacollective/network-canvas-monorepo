import Icon from '@codaco/fresco-ui/Icon';
import Node, { type NodeColorSequence } from '@codaco/fresco-ui/Node';
import {
  type ColorReference,
  type NodeShapeReference,
  resolveNodeShapeReference,
} from '@codaco/protocol-validation';
import { cva } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

import { useStoredShapeSvgs } from './useStoredShapeSvgs';

type EntityIconSize = 'default' | 'small' | 'tiny';

type CustomShapes = Readonly<Record<string, Readonly<{ asset: string }>>>;

type EntityIconProps = {
  entity: string;
  color?: ColorReference;
  /** A node type's default shape, as the codebook stores it. */
  shape?: NodeShapeReference;
  /** The node type's own custom shapes, which `shape` may name. */
  customShapes?: CustomShapes;
  label?: React.ReactNode;
  size?: EntityIconSize;
};

const nodeSizeMap: Record<EntityIconSize, 'xxs' | 'xs' | 'sm'> = {
  default: 'sm',
  small: 'xs',
  tiny: 'xxs',
};

const edgeSizeMap: Record<EntityIconSize, string> = {
  default: 'size-24',
  small: 'size-16',
  tiny: 'size-8',
};

const graphicVariants = cva({
  base: 'flex items-center justify-center',
  variants: {
    size: {
      default: 'me-5',
      small: 'me-2.5',
      tiny: 'me-1',
    },
  },
  defaultVariants: { size: 'default' },
});

const edgeIconStyle = (
  color: ColorReference,
): React.CSSProperties & Record<`--${string}`, string> => ({
  '--icon-tone-primary': resolveProtocolColor(color, { dark: true }),
  '--icon-tone-secondary': resolveProtocolColor(color),
});

type NodeIconProps = {
  color?: ColorReference;
  shape?: NodeShapeReference;
  customShapes?: CustomShapes;
  size: EntityIconSize;
};

const NodeIcon = ({ color, shape, customShapes, size }: NodeIconProps) => {
  const shapeSvgs = useStoredShapeSvgs(customShapes);
  // Color comes from the codebook, which protocol-validation guarantees is
  // a NodeColorSequence value when entity === "node".
  return (
    <Node
      presentational
      label=""
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the validated codebook only holds node colours for a node type, though ColorReference also spans the edge and variable palettes
      color={color as NodeColorSequence | undefined}
      shape={
        resolveNodeShapeReference(shape, customShapes, shapeSvgs) ?? 'circle'
      }
      size={nodeSizeMap[size]}
    />
  );
};

const renderIcon = ({
  entity,
  color,
  shape,
  customShapes,
  size = 'default',
}: EntityIconProps) => {
  switch (entity) {
    case 'node':
      return (
        <NodeIcon
          color={color}
          shape={shape}
          customShapes={customShapes}
          size={size}
        />
      );
    case 'edge':
      return (
        <Icon
          name="links"
          className={edgeSizeMap[size]}
          style={color ? edgeIconStyle(color) : undefined}
        />
      );
    case 'asset':
      return (
        <Icon
          name="menu-sociogram"
          className="[--icon-tone-primary:oklch(var(--cerulean-blue--dark))] [--icon-tone-secondary:oklch(var(--cerulean-blue))]"
        />
      );
    default:
      return null;
  }
};

const EntityIcon = (props: EntityIconProps) => {
  const { label, size = 'default' } = props;
  if (!label) {
    return renderIcon(props);
  }

  return (
    <div className="inline-flex flex-row items-center justify-start">
      <div className={graphicVariants({ size })}>{renderIcon(props)}</div>
      <div>{label}</div>
    </div>
  );
};

export default EntityIcon;
