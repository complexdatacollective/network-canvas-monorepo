import type React from "react";
import cx from "classnames";

type TagProps = {
	id: string;
	children?: React.ReactNode;
	color?: string | null;
	onClick?: ((id: string) => void) | null;
	selected?: boolean;
	light?: boolean;
	disabled?: boolean;
};

const Tag = ({
	id,
	children = null,
	color = null,
	onClick = null,
	selected = false,
	light = false,
	disabled = false,
}: TagProps) => {
	const componentClasses = cx("tag", {
		"tag--selected": selected,
		"tag--light": light,
		"tag--clickable": !disabled && !!onClick,
		clickable: !disabled && !!onClick,
		"tag--disabled": disabled,
	});

	const dotClasses = `tag__dot tag__dot--${color}`;

	return (
		<div className={componentClasses} onClick={() => !disabled && onClick && onClick(id)}>
			<div className={dotClasses} />
			<div className="tag__label">{children}</div>
		</div>
	);
};

export default Tag;
