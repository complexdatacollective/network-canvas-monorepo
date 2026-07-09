import Icon from '@codaco/fresco-ui/Icon';
import Node, {
  type NodeColorSequence,
  type NodeShape,
} from '@codaco/fresco-ui/Node';
import { cva } from '~/utils/cva';
import { resolveProtocolColor } from '~/utils/resolveProtocolColor';

type EntityIconSize = 'default' | 'small' | 'tiny';

type EntityIconProps = {
  entity: string;
  color?: string;
  shape?: NodeShape;
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
      default: 'mr-5',
      small: 'mr-2.5',
      tiny: 'mr-1',
    },
  },
  defaultVariants: { size: 'default' },
});

const renderIcon = (
  entity: string,
  color?: string,
  shape: NodeShape = 'circle',
  size: EntityIconSize = 'default',
) => {
  switch (entity) {
    case 'node':
      // Color comes from the codebook, which protocol-validation guarantees is
      // a NodeColorSequence value when entity === "node".
      return (
        <Node
          label=""
          color={color as NodeColorSequence | undefined}
          shape={shape}
          size={nodeSizeMap[size]}
        />
      );
    case 'edge':
      return (
        <Icon
          name="links"
          className={edgeSizeMap[size]}
          style={
            color
              ? ({
                  '--icon-tone-primary': resolveProtocolColor(color, {
                    dark: true,
                  }),
                  '--icon-tone-secondary': resolveProtocolColor(color),
                } as React.CSSProperties)
              : undefined
          }
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

const EntityIcon = ({
  entity,
  color,
  shape = 'circle',
  label,
  size = 'default',
}: EntityIconProps) => {
  if (!label) {
    return renderIcon(entity, color, shape, size);
  }

  return (
    <div className="inline-flex flex-row items-center justify-start">
      <div className={graphicVariants({ size })}>
        {renderIcon(entity, color, shape, size)}
      </div>
      <div>{label}</div>
    </div>
  );
};

export default EntityIcon;
