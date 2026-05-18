import CloseButton from "@codaco/fresco-ui/CloseButton";
import DialogPopup from "@codaco/fresco-ui/dialogs/DialogPopup";
import Modal from "@codaco/fresco-ui/Modal";
import type { ReactNode } from "react";

type HomeModalProps = {
	open: boolean;
	onClose: () => void;
	title?: ReactNode;
	action?: ReactNode;
	maxWidth?: number;
	children: ReactNode;
};

// ModalPopup spreads consumer props before applying its own inline style for borderRadius,
// which replaces any consumer style. Express maxWidth as a Tailwind arbitrary class so it
// survives via the className path. Map the discrete values used by callers.
function maxWidthClass(maxWidth: number): string {
	switch (maxWidth) {
		case 1080:
			return "max-w-[1080px]";
		case 1000:
			return "max-w-[1000px]";
		default:
			return "max-w-[880px]";
	}
}

export function HomeModal({ open, onClose, title, action, maxWidth = 880, children }: HomeModalProps) {
	return (
		<Modal
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose();
			}}
		>
			<DialogPopup className={maxWidthClass(maxWidth)}>
				<div className="flex items-center justify-between gap-4 px-8 pt-6">
					<div className="flex min-w-0 items-center gap-3.5">{title}</div>
					<div className="flex items-center gap-2.5">
						{action}
						<CloseButton onClick={onClose} />
					</div>
				</div>
				<div className="px-8 pt-6 pb-8">{children}</div>
			</DialogPopup>
		</Modal>
	);
}
