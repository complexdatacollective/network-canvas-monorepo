import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { AnimatePresence } from "motion/react";
import type { ReactElement } from "react";
import { DialogBackdrop } from "~/components/NewComponents/Dialog";

type ModalProps = {
	show: boolean;
	children?: ReactElement | null;
	zIndex?: number | null;
	onOpenChange?: (open: boolean) => void;
};

const Modal = ({ children, show = false, onOpenChange }: ModalProps) => {
	return (
		<BaseDialog.Root open={show} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{show && (
					<BaseDialog.Portal keepMounted>
						<DialogBackdrop />
						{children}
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
};

export { Modal };

export default Modal;
