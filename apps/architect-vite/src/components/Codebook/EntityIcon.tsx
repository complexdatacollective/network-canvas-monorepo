import cx from "classnames";
import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";
import { Icon } from "~/lib/legacy-ui/components";

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

const renderIcon = (entity: string, color?: string, shape: NodeShape = "circle", size: EntityIconSize = "default") => {
	switch (entity) {
		case "node":
			return <Node label="" color={color} shape={shape} size={nodeSizeMap[size]} />;
		case "edge":
			return <Icon name="links" color={color} />;
		case "asset":
			return <Icon name="menu-sociogram" color="cerulean-blue" />;
		default:
			return null;
	}
};

const EntityIcon = ({ entity, color, shape = "circle", label, size = "default" }: EntityIconProps) => {
	if (!label) {
		return renderIcon(entity, color, shape, size);
	}

	const classes = cx("entity-icon", {
		"entity-icon--small": size === "small",
		"entity-icon--tiny": size === "tiny",
	});

	return (
		<div className={classes}>
			<div className="entity-icon__graphic">{renderIcon(entity, color, shape, size)}</div>
			<div className="entity-icon__label">{label}</div>
		</div>
	);
};

export default EntityIcon;
