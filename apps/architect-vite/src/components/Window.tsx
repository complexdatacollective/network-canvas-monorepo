import { getCSSVariableAsNumber } from "@codaco/legacy-ui/utils/CSSVariables";
import cx from "classnames";
import React from "react";
import { createPortal } from "react-dom";
import Stackable from "~/components/Stackable";

type WindowFrameProps = {
	children?: React.ReactNode;
	className?: string | null;
	leftControls?: React.ReactNode[];
	rightControls?: React.ReactNode[];
	show?: boolean;
	title?: string | null;
};

// TODO: This is so confusingly named. Was 'Window', but we also had `window` and there were collisions with vite globals.
const WindowFrame = ({
	show = true,
	title = null,
	children = null,
	leftControls = [],
	rightControls = [],
	className = null,
}: WindowFrameProps) => {
	if (!show) {
		return null;
	}

	const dialogZIndex = getCSSVariableAsNumber("--z-dialog");

	return createPortal(
		<Stackable stackKey>
			{({ stackIndex }) => (
				<div
					className={cx("window", className)}
					style={{
						zIndex: dialogZIndex + stackIndex,
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="window__container">
						{title && (
							<div className="window__heading stage-heading stage-heading--inline stage-heading--collapsed">
								<div className="stage-editor">
									<h2>{title}</h2>
								</div>
							</div>
						)}
						<div className="window__main">
							<div className="window__content">{children}</div>
						</div>
						<div className="window__controls">
							{leftControls && <div className="window__controls-left">{leftControls}</div>}
							{rightControls && <div className="window__controls-right">{rightControls}</div>}
						</div>
					</div>
				</div>
			)}
		</Stackable>,
		document.body,
	);
};


export default WindowFrame;
