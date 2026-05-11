import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";

const SlotContext = createContext<HTMLElement | null>(null);
const SetSlotContext = createContext<(el: HTMLElement | null) => void>(() => {});

export const PageActionsProvider = ({ children }: { children: ReactNode }) => {
	const [slot, setSlot] = useState<HTMLElement | null>(null);
	return (
		<SetSlotContext.Provider value={setSlot}>
			<SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
		</SetSlotContext.Provider>
	);
};

// `display: contents` lets portaled actions sit as direct flex children of the toolbar.
export const PageActionsTarget = () => {
	const setSlot = useContext(SetSlotContext);
	return <div ref={setSlot} className="contents" />;
};

export const PageActions = ({ children }: { children: ReactNode }) => {
	const slot = useContext(SlotContext);
	if (!slot) return null;
	return createPortal(children, slot);
};
