import type { ComponentType } from "react";
import icons from "../assets/img/icons";

type IconComponent = ComponentType<Record<string, unknown>>;

const getNCIcon = (name: string): IconComponent | null => {
	if (!Object.hasOwn(icons, name)) {
		return null;
	}
	const icon = icons[name];
	return (icon as IconComponent) ?? null;
};

// Done this way so that, in theory, performance will be the same for using our
// own icons.
const getIcon = (name: string): IconComponent | null => getNCIcon(name);

export default getIcon;
