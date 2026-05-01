"use client";

import * as React from "react";
import { headingVariants } from "./typography/Heading";
import { cx } from "./utils/cva";

const Label = React.forwardRef<
	React.ElementRef<"label">,
	React.ComponentPropsWithoutRef<"label"> & {
		required?: boolean;
	}
>(
	(
		{
			className,
			required,
			htmlFor,
			children,
			onAnimationStart: _onAnimationStart,
			onAnimationEnd: _onAnimationEnd,
			onAnimationIteration: _onAnimationIteration,
			onDrag: _onDrag,
			onDragEnd: _onDragEnd,
			onDragEnter: _onDragEnter,
			onDragExit: _onDragExit,
			onDragLeave: _onDragLeave,
			onDragOver: _onDragOver,
			onDragStart: _onDragStart,
			onDrop: _onDrop,
			...props
		},
		ref,
	) => (
		<label
			ref={ref}
			htmlFor={htmlFor}
			className={cx("inline-block", headingVariants({ level: "label" }), "peer-disabled:opacity-70", className)}
			{...props}
		>
			{children}
			{required && (
				<span className="text-destructive" aria-hidden="true">
					{" "}
					*
				</span>
			)}
		</label>
	),
);
Label.displayName = "Label";

export { Label };
