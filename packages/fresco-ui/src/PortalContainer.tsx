"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({ children }: { children: ReactNode }) {
	const [container, setContainer] = useState<HTMLElement | null>(null);
	return (
		<PortalContainerContext.Provider value={container}>
			{children}
			<div ref={setContainer} />
		</PortalContainerContext.Provider>
	);
}

export function usePortalContainer() {
	return useContext(PortalContainerContext);
}
