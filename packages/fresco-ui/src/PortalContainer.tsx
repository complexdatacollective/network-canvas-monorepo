"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({ children }: { children: ReactNode }) {
	const [container, setContainer] = useState<HTMLElement | null>(null);
	return (
		<PortalContainerContext.Provider value={container}>
			{children}
			{/*
			 * `isolate` (isolation: isolate) creates a new stacking context for
			 * everything portaled into this container. Combined with `z-50`,
			 * the entire portal layer sits above sibling stage content —
			 * tooltips, popovers, dropdowns, modals, the drag preview — none of
			 * which set their own z-index — would otherwise compete with stage
			 * content's stacking contexts (e.g., motion.div transforms create
			 * stacking contexts on the form, navigation, etc).
			 *
			 * `fixed inset-0` (rather than the more obvious `relative`) so the
			 * container fills the viewport as a containing block for the
			 * `position: absolute` Positioners inside base-ui popups. With a
			 * 0-wide `relative` container, those Positioners shrink-to-fit to
			 * min-content width, collapsing menu/tooltip text to its longest
			 * unbreakable token. `pointer-events-none` keeps the empty
			 * viewport-sized portal layer from swallowing interactions on the
			 * stage below; `[&>*]:pointer-events-auto` re-enables pointer
			 * events on each portaled root (dialog backdrop/popup, tooltip /
			 * menu / popover Positioner) so dialogs remain interactive —
			 * `pointer-events` inherits, so we override on the children
			 * instead of asking every consumer to.
			 */}
			<div ref={setContainer} className="pointer-events-none fixed inset-0 isolate z-50 [&>*]:pointer-events-auto" />
		</PortalContainerContext.Provider>
	);
}

export function usePortalContainer() {
	return useContext(PortalContainerContext);
}
