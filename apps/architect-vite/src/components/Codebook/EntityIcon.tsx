import { Icon, Node } from "~/lib/legacy-ui/components";

interface EntityIconProps {
	entity: string;
	color?: string;
}

const EntityIcon = ({ entity, color }: EntityIconProps) => {
	switch (entity) {
		case "node":
			return <Node label="" color={color} />;
		case "edge":
			return <Icon name="links" color={color} />;
		case "asset":
			return <Icon name="menu-sociogram" color="cerulean-blue" />;
		default:
			return `No icon found for ${entity}.`;
	}
};

export default EntityIcon;
