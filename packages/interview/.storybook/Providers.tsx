"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Toast } from "@base-ui/react/toast";
import DialogProvider from "@codaco/fresco-ui/dialogs/DialogProvider";
import { DndStoreProvider } from "@codaco/fresco-ui/dnd/dnd";
import { Toaster } from "@codaco/fresco-ui/Toast";
import { TooltipProvider } from "@codaco/fresco-ui/Tooltip";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { CurrentStepProvider } from "../src/contexts/CurrentStepContext";
import { ContractProvider } from "../src/contract/context";

const noopAssetUrl = (assetId: string) =>
	Promise.resolve(`data:text/plain;base64,${btoa(`storybook-asset:${assetId}`)}`);
const noopFinish = () => Promise.resolve();

/**
 * Mounted as a global decorator in preview.tsx so every story sees the
 * providers it would normally get from a Fresco-style host page.
 *
 * - CurrentStepProvider: post-Phase-F, components reach the current
 *   stage step via React context (`useStageSelector` → `useCurrentStep`).
 *   Atomic stories that render a component without going through Shell
 *   would otherwise crash with "useCurrentStep must be used within a
 *   CurrentStepProvider". Uncontrolled mode (no props) defaults to step 0,
 *   which is fine for stories that don't navigate. Stories that DO mount
 *   `<Shell>` get its own inner CurrentStepProvider that shadows this one.
 * - ContractProvider: components like QuickNodeForm read flags via
 *   `useContractFlags()`; without a provider they crash. Defaults supply
 *   no-op handlers and `isDevelopment: true`. Shell wraps its own
 *   ContractProvider too, so full-Shell stories shadow this one.
 * - DndStoreProvider: required by `Collection` (and anything else built
 *   on `useDropTarget`).
 * - DialogProvider: required by stages that pop a confirmation dialog.
 * - TooltipProvider: required by any Tooltip-using component.
 * - Toast.Provider + Toaster: default toast surface.
 *
 * Interview-specific toasts (validation errors, etc.) are rendered by
 * Shell's own internal Toast.Provider + InterviewToastViewport, so this
 * decorator only needs to provide the default toast surface.
 */
export default function Providers({
	children,
	disableAnimations,
}: {
	children: ReactNode;
	disableAnimations?: boolean;
}) {
	if (disableAnimations) {
		globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
	}

	return (
		<MotionConfig reducedMotion="user" skipAnimations={disableAnimations}>
			<DirectionProvider direction="ltr">
				<Toast.Provider limit={7}>
					<TooltipProvider>
						<DndStoreProvider>
							<DialogProvider>
								<ContractProvider onFinish={noopFinish} onRequestAsset={noopAssetUrl} flags={{ isDevelopment: true }}>
									<CurrentStepProvider>{children}</CurrentStepProvider>
								</ContractProvider>
							</DialogProvider>
						</DndStoreProvider>
					</TooltipProvider>
					<Toaster />
				</Toast.Provider>
			</DirectionProvider>
		</MotionConfig>
	);
}
