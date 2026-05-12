"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type React from "react";
import type { ReactNode } from "react";
import CloseButton from "../CloseButton";
import { type SurfaceVariants, surfaceSpacingVariants } from "../layout/Surface";
import Modal from "../Modal/Modal";
import { ScrollArea } from "../ScrollArea";
import Heading from "../typography/Heading";
import Paragraph from "../typography/Paragraph";
import { cx } from "../utils/cva";
import DialogPopup from "./DialogPopup";

// TODO: These seem like they belong in a shared location.
export const STATE_VARIANTS = ["default", "destructive", "success", "info"] as const;

export type DialogProps = {
	title?: string;
	description?: ReactNode;
	accent?: (typeof STATE_VARIANTS)[number];
	closeDialog?: () => void;
	footer?: React.ReactNode;
	open?: boolean;
	children?: ReactNode;
	className?: string;
	layoutId?: string;
} & SurfaceVariants;

/**
 * Dialog component using Base UI Dialog primitives with motion animations.
 *
 * For use with `useDialog` and `DialogProvider`. Use `Dialog` in
 * situations where you need to control the dialog's open state manually.
 *
 * Implementation Notes:
 *
 * - Uses Base UI Dialog for accessibility and state management
 * - ModalPopup with ModalPopupAnimation for consistent animations
 * - Surface styling applied via className for proper elevation and spacing
 * - Backdrop click-to-close is handled by Base UI's dismissible behavior
 */
export default function Dialog({
	title,
	description,
	children,
	closeDialog,
	accent,
	footer,
	open = false,
	className,
	...rest
}: DialogProps) {
	return (
		<Modal
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen && closeDialog) {
					closeDialog();
				}
			}}
		>
			<DialogPopup
				key="dialog-popup"
				className={cx(
					// Accent overrides the primary hue so that nested primary buttons inherit color.
					// Override the primitives (--primary/--primary-contrast) because @theme inline
					// substitutes the --color-* aliases at compile time — consumers like Button read
					// the primitives directly, so an alias override wouldn't propagate.
					accent === "success" && "[--primary:var(--success)]",
					accent === "info" && "[--primary:var(--info)]",
					accent === "destructive" && "[--primary-contrast:var(--destructive-contrast)] [--primary:var(--destructive)]",
					className,
				)}
				{...rest}
			>
				<DialogHeader>
					<BaseDialog.Title render={<Heading level="h2" margin="none" />}>{title}</BaseDialog.Title>
					<BaseDialog.Close render={<CloseButton />} />
				</DialogHeader>
				<DialogContent>
					{description && <BaseDialog.Description render={<Paragraph />}>{description}</BaseDialog.Description>}
					{children}
				</DialogContent>
				<DialogFooter>{footer}</DialogFooter>
			</DialogPopup>
		</Modal>
	);
}

Dialog.displayName = "Dialog";

const DialogHeader = ({ children }: { children: React.ReactNode }) => {
	return (
		<div className={cx("mb-4 flex items-center justify-between gap-2", surfaceSpacingVariants({ section: "header" }))}>
			{children}
		</div>
	);
};

const DialogContent = ({ children }: { children: React.ReactNode }) => {
	return (
		<ScrollArea
			viewportClassName={surfaceSpacingVariants({
				section: "content",
				className: "py-2!",
			})}
		>
			{children}
		</ScrollArea>
	);
};

// Layout convention: place the cancel/dismiss action as the first child to pin it left.
// Primary and any secondary actions follow and cluster on the right. A single-child footer
// (e.g. acknowledge dialog) is right-aligned by `justify-end`.
const DialogFooter = ({ children, className }: { children?: React.ReactNode; className?: string }) => {
	return (
		<footer
			className={cx(
				"phone-landscape:flex-row phone-landscape:justify-end phone-landscape:[&>*:first-child:not(:only-child)]:mr-auto mt-4 flex flex-col gap-2",
				children && "mt-6",
				surfaceSpacingVariants({ section: "footer" }),
				className,
			)}
		>
			{children}
		</footer>
	);
};

export { DialogFooter };
