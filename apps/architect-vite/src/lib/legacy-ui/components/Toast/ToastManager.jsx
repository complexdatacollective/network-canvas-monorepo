import { AnimatePresence } from "motion/react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import Toast from "./Toast";

const ToastManager = ({ toasts, removeToast }) =>
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

ToastManager.propTypes = {
	toasts: PropTypes.array.isRequired,
	removeToast: PropTypes.func.isRequired,
};

export default ToastManager;
