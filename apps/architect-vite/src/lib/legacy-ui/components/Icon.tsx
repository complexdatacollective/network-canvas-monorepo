import cx from "classnames";
import type React from "react";
import { memo, useMemo } from "react";
import icons from "../utils/getIcon";

type IconProps = {
	name: string;
	className?: string;
	color?: string;
	style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLElement>;

const Icon = ({ color = "", name, className = "", style = {}, ...rest }: IconProps) => {
	const iconClassNames = cx(
		{
			icon: true,
			[`icon--${color}`]: !!color,
		},
		[className],
	);

	const IconComponent = useMemo(() => icons(name), [name]);

	if (!IconComponent) {
		console.warn("Invalid icon name:", name);
		return null;
	}

	return <IconComponent className={iconClassNames} name={name} style={style} {...rest} />;
};

export default memo(Icon);
