import { motion } from "motion/react";
import type { ReactNode } from "react";
import useTimeout from "../../hooks/useTimeout";
import CloseButton from "../CloseButton";
import CompleteIcon from "../CompleteIcon";
import Icon from "../Icon";

type ToastType = "info" | "warning" | "error" | "success";

type ToastProps = {
	id: string | number;
	title: string;
	content: ReactNode | (() => ReactNode);
	type: ToastType;
	autoDismiss?: boolean;
	dismissHandler?: (() => void) | null;
	dismissDuration?: number;
	CustomIcon?: ReactNode | null;
	className?: string;
};

const Toast = ({
	id,
	title,
	content,
	type,
	autoDismiss = true,
	dismissHandler = null,
	dismissDuration = 8000,
	CustomIcon = null,
	className = "",
}: ToastProps) => {
	if (autoDismiss && dismissHandler) {
		useTimeout(dismissHandler, dismissDuration);
	}

	const getIcon = () => {
		if (CustomIcon) {
			return CustomIcon;
		}

		if (type === "success") {
			return <CompleteIcon />;
		}

		if (type === "warning") {
			return <Icon name="warning" />;
		}

		if (type === "error") {
			return <Icon name="error" />;
		}

		return <Icon name="info" />;
	};

	const getContent = () => {
		if (typeof content === "function") {
			return content();
		}

		return content;
	};

	return (
		<motion.li
			key={id}
			layout
			initial={{ opacity: 0, y: 50, scale: 0.3 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{
				delay: 0.2,
				type: "spring",
				layoutY: { delay: 0, type: "spring" },
			}}
			exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
			className={`toast toast--${type} ${className}`}
		>
			<div className="toast-icon">{getIcon()}</div>
			<div className="toast-content">
				<h4 className="toast-content__title">{title}</h4>
				{getContent()}
			</div>
			<CloseButton onClick={dismissHandler} />
		</motion.li>
	);
};

export default Toast;
