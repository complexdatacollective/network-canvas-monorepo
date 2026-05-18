import Node, { type NodeColorSequence, type NodeShape } from "@codaco/fresco-ui/Node";
import { Icon } from "~/lib/legacy-ui/components";
import { cva } from "~/utils/cva";

type EntityIconSize = "default" | "small" | "tiny";

type EntityIconProps = {
	entity: string;
	color?: string;
	shape?: NodeShape;
	label?: React.ReactNode;
	size?: EntityIconSize;
};

const nodeSizeMap: Record<EntityIconSize, "xxs" | "xs" | "sm"> = {
	default: "sm",
	small: "xs",
	tiny: "xxs",
};

const graphicVariants = cva({
	base: "flex items-center justify-center",
	variants: {
		size: {
			default: "mr-(--space-md)",
			small: "mr-(--space-sm)",
			tiny: "mr-(--space-xs)",
		},
	},
	defaultVariants: { size: "default" },
});

const renderIcon = (entity: string, color?: string, shape: NodeShape = "circle", size: EntityIconSize = "default") => {
	switch (entity) {
		case "node":
			// Color comes from the codebook, which protocol-validation guarantees is
			// a NodeColorSequence value when entity === "node".
			return <Node label="" color={color as NodeColorSequence | undefined} shape={shape} size={nodeSizeMap[size]} />;
		case "edge":
			return (
				<Icon
					name="links"
					style={
						color
							? ({
									"--icon-tone-primary": `hsl(var(--${color}-dark))`,
									"--icon-tone-secondary": `hsl(var(--${color}))`,
								} as React.CSSProperties)
							: undefined
					}
				/>
			);
		case "asset":
			return (
				<Icon
					name="menu-sociogram"
					className="[--icon-tone-primary:var(--color-cerulean-blue-dark)] [--icon-tone-secondary:var(--color-cerulean-blue)]"
				/>
			);
		default:
			return null;
	}
};

const EntityIcon = ({ entity, color, shape = "circle", label, size = "default" }: EntityIconProps) => {
	if (!label) {
		return renderIcon(entity, color, shape, size);
	}

	return (
		<div className="inline-flex flex-row items-center justify-start">
			<div className={graphicVariants({ size })}>{renderIcon(entity, color, shape, size)}</div>
			<div>{label}</div>
		</div>
	);
};

export default EntityIcon;
