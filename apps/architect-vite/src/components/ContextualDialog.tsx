import cx from "classnames";
import type React from "react";
import { useCallback } from "react";
import { createPortal } from "react-dom";
import Stackable from "~/components/Stackable";
import { getCSSVariableAsNumber } from "~/lib/legacy-ui/utils/CSSVariables";

type ControlsProps = {
	children?: React.ReactNode;
};

export const Controls = ({ children = null }: ControlsProps) => (
	<div className="contextual-dialog__controls">{children}</div>
);

type TitleProps = {
	children?: React.ReactNode;
};

export const Title = ({ children = null }: TitleProps) => <h2 className="contextual-dialog__title">{children}</h2>;

type DialogProps = {
	children?: React.ReactNode;
	className?: string | null;
	show?: boolean;
	onBlur?: () => void;
};

const Dialog = ({ show = true, children = null, className = null, onBlur = () => {} }: DialogProps) => {
	if (!show) {
		return null;
	}

	const dialogZIndex = getCSSVariableAsNumber("--z-dialog");

	const handleBlur = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onBlur();
		},
		[onBlur],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onBlur();
			}
		},
		[onBlur],
	);

	return createPortal(
		<Stackable stackKey>
			{({ stackIndex }: { stackIndex: number }) => (
				<div
					className={cx("contextual-dialog", className)}
					style={{
						zIndex: dialogZIndex + stackIndex,
					}}
					onClick={handleBlur}
					onKeyDown={handleKeyDown}
					role="button"
					tabIndex={-1}
					aria-label="Close dialog"
				>
					<div className="contextual-dialog__container">
						<div className="contextual-dialog__main">
							<div className="contextual-dialog__content">{children}</div>
						</div>
					</div>
				</div>
			)}
		</Stackable>,
		document.body,
	);
};

export default Dialog;
