"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "~/lib/legacy-ui/components";
import { cn } from "~/utils/cn";

export function DialogBackdrop(props: BaseDialog.Backdrop.Props) {
	return (
		<BaseDialog.Backdrop
			render={
				<motion.div
					className="fixed inset-0 z-[var(--z-default)] bg-rich-black/50 backdrop-blur-sm flex items-center justify-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				/>
			}
			{...props}
		/>
	);
}

type DialogPopupProps = ComponentProps<typeof motion.div> & {
	size?: "lg";
	header: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
};

export function DialogPopup({ size, header, children, footer, ...props }: DialogPopupProps) {
	return (
		<BaseDialog.Popup
			render={
				<div className="fixed inset-0 z-[calc(var(--z-default)+1)] flex items-center justify-center pointer-events-none">
					<motion.div
						className={cn(
							"rounded-[10px] m-6 bg-surface-1 text-surface-1-foreground z-[calc(var(--z-default)+2)] max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto",
							size === "lg" ? "max-w-full" : "max-w-4xl",
						)}
						{...props}
					>
						{header && <div className="sticky top-0 bg-accent text-accent-foreground px-4 py-6 z-10">{header}</div>}
						<div className="flex-1 overflow-y-auto px-4 py-6">{children}</div>
						{footer && (
							<div className="sticky bottom-0 bg-accent text-accent-foreground px-4 py-6 flex justify-end gap-2.5">
								{footer}
							</div>
						)}
					</motion.div>
				</div>
			}
		/>
	);
}

export function DialogTitle(props: BaseDialog.Title.Props) {
	return <BaseDialog.Title className="text-2xl font-semibold m-0 pb-6" {...props} />;
}

export function DialogDescription(props: BaseDialog.Description.Props) {
	return <BaseDialog.Description className="text-base text-surface-2-foreground" {...props} />;
}

type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	header?: ReactNode;
	children?: ReactNode;
	onConfirm?: () => void;
	onCancel?: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: unknown; // todo
	size?: "lg";
};

function Dialog({
	open,
	onOpenChange,
	title = "Confirm",
	description,
	header,
	children,
	onConfirm,
	onCancel,
	confirmText = "Confirm",
	cancelText = "Cancel",
	confirmColor = "sea-green",
	size,
}: DialogProps) {
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<BaseDialog.Portal keepMounted>
						<DialogBackdrop>
							<DialogPopup
								size={size}
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
							>
								{header && <div className="sticky top-0 bg-accent px-4 py-6 z-10">{header}</div>}
								<div className="flex-1 overflow-y-auto px-4 py-6">
									{title && !header && <DialogTitle>{title}</DialogTitle>}
									{description && <DialogDescription>{description}</DialogDescription>}
									{children}
								</div>
								<div className="border-t border-divider px-4 py-5 flex justify-end gap-2.5">
									<BaseDialog.Close
										render={
											<Button onClick={onCancel ?? onOpenChange} color="platinum">
												{cancelText}
											</Button>
										}
									/>

									{onConfirm && (
										<Button onClick={onConfirm} color={confirmColor}>
											{confirmText}
										</Button>
									)}
								</div>
							</DialogPopup>
						</DialogBackdrop>
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
}

export default Dialog;
