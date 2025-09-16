import { Dialog } from "@base-ui-components/react/dialog";
import type { ReactElement } from "react";

type ModalProps = {
	show?: boolean;
	children?: ReactElement | null;
	zIndex?: number | null;
};

const Modal = ({ children, show = false }: ModalProps) => {
	return (
		<Dialog.Root open={show}>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 bg-rich-black opacity-20 transition-all duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:opacity-70" />
				<Dialog.Popup className="fixed top-1/2 left-1/2 max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 my-auto mx-0">
					{children}
					<Dialog.Close>Close</Dialog.Close>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
};

export { Modal };

export default Modal;
