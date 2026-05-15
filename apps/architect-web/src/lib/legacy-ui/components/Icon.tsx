import type React from "react";
import { memo, useMemo } from "react";
import { cx } from "~/utils/cva";
import icons from "../utils/getIcon";

type IconProps = {
	name: string;
	className?: string;
	style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLElement>;

const Icon = ({ name, className = "", style = {}, ...rest }: IconProps) => {
	const iconClassNames = cx("icon", className);

	const IconComponent = useMemo(() => icons(name), [name]);

	if (!IconComponent) {
		return null;
	}

	return <IconComponent className={iconClassNames} name={name} style={style} {...rest} />;
};

export default memo(Icon);
