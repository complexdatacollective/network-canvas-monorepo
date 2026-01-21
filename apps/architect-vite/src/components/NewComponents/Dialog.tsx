"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { Button, Modal } from "~/lib/legacy-ui/components";
import { cn } from "~/utils/cn";

export function DialogBackdrop(props: BaseDialog.Backdrop.Props) {
	return (
		<BaseDialog.Backdrop
			render={
				<motion.div
					className="fixed inset-0 min-h-dvh bg-rich-black/50 backdrop-blur-md supports-[-webkit-touch-callout:none]:absolute"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.5 }}
				/>
			}
			{...props}
		/>
	);
}

type DialogPopupProps = ComponentProps<typeof motion.div> & {
	size?: "lg";
	header?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	onAnimationComplete?: () => void;
};

function DialogPopup({ size, header, children, footer, className, onAnimationComplete, ...props }: DialogPopupProps) {
	return (
		<BaseDialog.Popup
			className={cn(
				"w-3xl",
				"fixed top-1/2 left-1/2 max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg overflow-hidden",
				"bg-surface-1 text-surface-1-foreground max-h-[80vh] flex flex-col",
				"shadow-xl",
				className,
			)}
			render={
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
					onAnimationComplete={onAnimationComplete}
					style={{ zIndex: 1000 }}
					{...props}
				>
					{header && <div className="sticky top-0 bg-accent text-accent-foreground px-4 py-6">{header}</div>}
					<div className="flex-1 overflow-y-auto px-4 py-6">{children}</div>
					{footer && (
						<div className="sticky bottom-0 bg-accent text-accent-foreground px-4 py-6 flex justify-end gap-2.5">
							{footer}
						</div>
					)}
				</motion.div>
			}
		/>
	);
}

function DialogTitle(props: BaseDialog.Title.Props) {
	return <BaseDialog.Title className="text-2xl font-semibold m-0 pb-6" {...props} />;
}

function DialogDescription(props: BaseDialog.Description.Props) {
	return <BaseDialog.Description className="text-base text-surface-2-foreground" {...props} />;
}

type DialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	header?: ReactNode;
	footer?: ReactNode;
	children?: ReactNode;
	onConfirm?: () => void;
	onCancel?: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: ComponentProps<typeof Button>["color"];
	size?: "lg";
	onAnimationComplete?: () => void;
} & ComponentProps<typeof motion.div>;

function Dialog({
	open,
	onOpenChange,
	title = "Confirm",
	description,
	header,
	footer,
	children,
	onConfirm,
	onCancel,
	confirmText = "Confirm",
	cancelText = "Cancel",
	confirmColor = "sea-green",
	onAnimationComplete,
	...popupProps
}: DialogProps) {
	return (
		<Modal open={open} onOpenChange={onOpenChange}>
			<DialogPopup header={header} footer={footer} onAnimationComplete={onAnimationComplete} {...popupProps}>
				<div className="flex-1">
					{title && !header && <DialogTitle>{title}</DialogTitle>}
					{description && <DialogDescription>{description}</DialogDescription>}
					{children}
				</div>

				<div className="border-t border-divider px-4 py-5 flex justify-end gap-2.5">
					{!footer && (
						<BaseDialog.Close
							render={
								<Button
									onClick={() => {
										onCancel?.();
										onOpenChange(false);
									}}
									color="platinum"
								>
									{cancelText}
								</Button>
							}
						/>
					)}

					{onConfirm && (
						<Button onClick={onConfirm} color={confirmColor}>
							{confirmText}
						</Button>
					)}
				</div>
			</DialogPopup>
		</Modal>
	);
}

// Attach BaseDialog.Close to Dialog for convenience
type DialogComponent = typeof Dialog & {
	Close: typeof BaseDialog.Close;
};

(Dialog as DialogComponent).Close = BaseDialog.Close;

export default Dialog as DialogComponent;
