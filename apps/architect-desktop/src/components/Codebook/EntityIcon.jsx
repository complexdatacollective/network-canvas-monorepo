import { Icon, Node } from "@codaco/ui/lib/components";
import React from "react";

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
