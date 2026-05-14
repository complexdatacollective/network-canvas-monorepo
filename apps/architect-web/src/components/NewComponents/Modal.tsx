import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { DialogBackdrop } from "./DialogBackdrop";

type ModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
	forceRender?: boolean;
};

export default function Modal({ open, onOpenChange, children, forceRender = false }: ModalProps) {
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<BaseDialog.Portal keepMounted className="z-(--z-dialog)">
						<DialogBackdrop forceRender={forceRender} />
						{children}
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
}
