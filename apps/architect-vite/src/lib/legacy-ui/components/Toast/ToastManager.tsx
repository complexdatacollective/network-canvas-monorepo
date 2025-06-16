import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import Toast from "./Toast";

interface ToastData {
	id: string | number;
	title: string;
	content: ReactNode | (() => ReactNode);
	type: "info" | "warning" | "error" | "success";
	autoDismiss?: boolean;
	dismissHandler?: () => void;
	classNames?: string;
	CustomIcon?: ReactNode;
}

interface ToastManagerProps {
	toasts: ToastData[];
	removeToast: (id: string | number) => void;
}

const ToastManager = ({ toasts, removeToast }: ToastManagerProps) =>
	createPortal(
		<div className="toast-container">
			<ul className="toast-container-list">
				<AnimatePresence>
					{toasts.map((toast) => (
						<Toast
							key={toast.id}
							id={toast.id}
							dismissHandler={() => {
								if (toast.dismissHandler) {
									toast.dismissHandler();
								}

								removeToast(toast.id);
							}}
							title={toast.title}
							content={toast.content}
							type={toast.type}
							autoDismiss={toast.autoDismiss}
							className={toast.classNames}
							CustomIcon={toast.CustomIcon}
						/>
					))}
				</AnimatePresence>
			</ul>
		</div>,
		document.body,
	);

export default ToastManager;
