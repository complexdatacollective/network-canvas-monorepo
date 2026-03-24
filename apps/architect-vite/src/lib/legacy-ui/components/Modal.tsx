import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import type { ReactNode } from "react";
import { DialogBackdrop } from "~/components/NewComponents/Dialog";

export default function Modal({
	open,
	onOpenChange,
	children,
	forceRender = false,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
	forceRender?: boolean;
}) {
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<BaseDialog.Portal keepMounted className="z-[var(--z-dialog)]">
						<DialogBackdrop forceRender={forceRender} />
						<BaseDialog.Popup>{children}</BaseDialog.Popup>
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
}
