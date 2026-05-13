"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { motion } from "motion/react";

export function DialogBackdrop(props: BaseDialog.Backdrop.Props) {
	return (
		<BaseDialog.Backdrop
			render={
				<motion.div
					className="fixed inset-0 z-(--z-dialog) min-h-dvh bg-rich-black/50 backdrop-blur-md supports-[-webkit-touch-callout:none]:absolute"
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
