"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "~/lib/legacy-ui/components";

interface DialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	children?: ReactNode;
	onConfirm?: () => void;
	onCancel?: () => void;
	confirmText?: string;
	cancelText?: string;
	confirmColor?: unknown; // todo
}

function Dialog({
	open,
	onOpenChange,
	title = "Confirm",
	description,
	children,
	onConfirm,
	onCancel,
	confirmText = "Confirm",
	cancelText = "Cancel",
	confirmColor = "sea-green",
}: DialogProps) {
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<BaseDialog.Portal keepMounted>
						<BaseDialog.Backdrop
							render={
								<motion.div
									className="fixed inset-0 z-[9999998] bg-rich-black/50 backdrop-blur-[3px]"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
								/>
							}
						/>
						<BaseDialog.Popup
							render={
								<div className="fixed inset-0 z-[9999999] flex items-center justify-center pointer-events-none">
									<motion.div
										className="rounded-[10px] border border-border bg-surface-1 text-surface-1-foreground z-[10000000] py-6 px-4 min-w-[400px] max-w-[800px] max-h-[80vh] overflow-y-auto pointer-events-auto"
										initial={dialogInitialState}
										animate={dialogOpenState}
										exit={dialogInitialState}
										style={{ transformPerspective: 500 }}
									>
										{title && <BaseDialog.Title className="text-2xl m-0 mb-5">{title}</BaseDialog.Title>}
										{description && <BaseDialog.Description className="mb-4">{description}</BaseDialog.Description>}
										{children && <div className="mb-5">{children}</div>}
										<div className="border-t border-divider pt-5 mt-5 flex justify-end gap-2.5">
											{onCancel && (
												<BaseDialog.Close
													render={
														<Button onClick={onCancel} color="platinum">
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
									</motion.div>
								</div>
							}
						/>
					</BaseDialog.Portal>
				)}
			</AnimatePresence>
		</BaseDialog.Root>
	);
}

const dialogOpenState: TargetAndTransition = {
	opacity: 1,
	filter: "blur(0px)",
	rotateX: 0,
	rotateY: 0,
	z: 0,
	transition: {
		delay: 0.2,
		duration: 0.5,
		ease: [0.17, 0.67, 0.51, 1],
		opacity: {
			delay: 0.2,
			duration: 0.5,
			ease: "easeOut",
		},
	},
};

const dialogInitialState: TargetAndTransition = {
	opacity: 0,
	filter: "blur(10px)",
	z: -100,
	rotateY: 25,
	rotateX: 5,
	// transformPerspective: 500,
	transition: {
		duration: 0.3,
		ease: [0.67, 0.17, 0.62, 0.64],
	},
};

export default Dialog;
