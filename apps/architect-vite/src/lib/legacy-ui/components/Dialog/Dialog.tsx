import cx from "classnames";
import type { ReactNode } from "react";
import NewDialog from "~/components/NewComponents/Dialog";
import Icon from "../Icon";

interface DialogProps {
	children?: ReactNode;
	type?: string;
	icon?: string;
	show?: boolean;
	options?: React.ReactElement[];
	title: string;
	message?: ReactNode;
	onBlur?: () => void;
	classNames?: string;
}

/*
 * Top level Dialog component, not intended to be used directly, if you need
 * a specific type of Dialog, create in the pattern of Notice
 */
const Dialog = ({
	children,
	type,
	icon,
	show = false,
	options = [],
	title,
	message,
	onBlur = () => {},
	classNames,
}: DialogProps) => (
	<NewDialog open={show} onOpenChange={() => onBlur()}>
		<div
			className={cx("dialog", { [`dialog--${type}`]: type }, classNames, "bg-slate-blue-dark text-accent-foreground")}
		>
			<div className="dialog__main">
				{icon && (
					<div className="dialog__main-icon">
						<Icon name={icon} />
					</div>
				)}
				<div className="dialog__main-content">
					<h2 className="dialog__main-title">{title}</h2>
					{message}
					{children}
				</div>
			</div>
			<footer className="dialog__footer">{options}</footer>
		</div>
	</NewDialog>
);

export { Dialog };

export default Dialog;
