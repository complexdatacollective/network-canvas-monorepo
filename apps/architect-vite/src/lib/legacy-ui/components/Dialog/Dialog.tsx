import cx from "classnames";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import Icon from "../Icon";
import Modal from "../Modal";

type DialogProps = {
	children?: ReactNode;
	type?: string;
	icon?: string;
	show?: boolean;
	options?: React.ReactElement[];
	title: string;
	message?: ReactNode;
	onBlur?: () => void;
	classNames?: string;
};

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
	<Modal open={show} onOpenChange={() => onBlur()}>
		<motion.div
			initial={{ opacity: 0, y: "-10%", scale: 1.1 }}
			animate={{
				opacity: 1,
				y: 0,
				scale: 1,
				filter: "blur(0px)",
			}}
			exit={{
				opacity: 0,
				y: "-10%",
				scale: 1.5,
				filter: "blur(10px)",
			}}
			transition={{
				type: "spring",
				stiffness: 300,
				damping: 30,
			}}
			style={{ zIndex: 1000 }}
			className={cx(
				"dialog",
				{ [`dialog--${type}`]: type },
				classNames,
				"p-6 flex flex-col gap-6",
				"bg-slate-blue-dark text-accent-foreground w-xl fixed top-1/2 left-1/2 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg",
			)}
		>
			<div className="flex gap-6">
				{icon && (
					<div className="flex items-center justify-center shrink-0">
						<Icon name={icon} />
					</div>
				)}
				<div className="min-w-0">
					<h2>{title}</h2>
					{message}
					{children}
				</div>
			</div>
			<footer className="flex gap-4 justify-end">{options}</footer>
		</motion.div>
	</Modal>
);

export default Dialog;
