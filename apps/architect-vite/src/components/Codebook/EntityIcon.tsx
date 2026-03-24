import type { NodeShape } from "~/components/Node/Node";
import Node from "~/components/Node/Node";
import { Icon } from "~/lib/legacy-ui/components";

type EntityIconProps = {
	entity: string;
	color?: string;
	shape?: NodeShape;
};

const EntityIcon = ({ entity, color, shape = "circle" }: EntityIconProps) => {
	switch (entity) {
		case "node":
			return <Node label="" color={color} shape={shape} size="xxs" />;
		case "edge":
			return <Icon name="links" color={color} />;
		case "asset":
			return <Icon name="menu-sociogram" color="cerulean-blue" />;
		default:
			return `No icon found for ${entity}.`;
	}
};

export default EntityIcon;
