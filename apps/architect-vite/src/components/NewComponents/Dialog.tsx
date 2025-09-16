"use client";

import { Dialog as BaseDialog } from "@base-ui-components/react/dialog";
import { AnimatePresence, motion, type TargetAndTransition } from "motion/react";
import { useState } from "react";
import { Button } from "~/lib/legacy-ui/components";

function Dialog() {
	const [open, setOpen] = useState(false);

	return (
		<div className="flex items-center justify-center min-h-[200px]">
			<BaseDialog.Root open={open} onOpenChange={setOpen}>
				<BaseDialog.Trigger render={<div data-primary-action>Open Dialog</div>} />
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
											className="rounded-[10px] border border-border bg-surface-1 text-surface-1-foreground z-[10000000] py-6 px-4 min-w-[300px] pointer-events-auto"
											initial={dialogInitialState}
											animate={dialogOpenState}
											exit={dialogInitialState}
											style={{ transformPerspective: 500 }}
										>
											<BaseDialog.Title className="text-2xl m-0 mb-5">Confirm</BaseDialog.Title>
											<BaseDialog.Description>Are you sure you want to become a Motion expert?</BaseDialog.Description>
											<div className="border-t border-divider pt-5 mt-5 flex justify-end gap-2.5">
												<BaseDialog.Close render={<Button>Cancel</Button>} />
												<BaseDialog.Close render={<Button color="neon-coral">Expert me</Button>} />
											</div>
										</motion.div>
									</div>
								}
							/>
						</BaseDialog.Portal>
					)}
				</AnimatePresence>
			</BaseDialog.Root>
		</div>
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
