import { Icon, Node } from "@codaco/legacy-ui/components";

const EntityIcon = ({ entity, color }) => {
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
