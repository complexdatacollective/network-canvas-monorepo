import type { ComponentType } from "react";
import icons from "../assets/img/icons";

type IconComponent = ComponentType<any>;

const getNCIcon = (name: string): IconComponent | null => {
	if (!Object.prototype.hasOwnProperty.call(icons, name)) {
		return null;
	}
	return icons[name];
};

// Done this way so that, in theory, performance will be the same for using our
// own icons.
const getIcon = (name: string): IconComponent | null => getNCIcon(name);

export default getIcon;
