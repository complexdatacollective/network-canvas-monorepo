"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Toast } from "@base-ui/react/toast";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import DialogProvider from "../src/dialogs/DialogProvider";
import { DndStoreProvider } from "../src/dnd/DndStoreProvider";
import { Toaster } from "../src/Toast";
import { TooltipProvider } from "../src/tooltip";

declare global {
	// eslint-disable-next-line no-var
	var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

type ProvidersProps = {
	children: ReactNode;
	disableAnimations?: boolean;
};

export default function Providers({ children, disableAnimations }: ProvidersProps) {
	if (disableAnimations) {
		globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
	}

	return (
		<MotionConfig reducedMotion="user" skipAnimations={disableAnimations}>
			<DirectionProvider direction="ltr">
				<Toast.Provider limit={7}>
					<TooltipProvider>
						<DndStoreProvider>
							<DialogProvider>{children}</DialogProvider>
						</DndStoreProvider>
					</TooltipProvider>
					<Toaster />
				</Toast.Provider>
			</DirectionProvider>
		</MotionConfig>
	);
}
