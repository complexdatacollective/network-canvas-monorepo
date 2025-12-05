import { useCallback, useEffect, useRef, useState } from "react";

type WindowProps = Record<string, unknown>;
type Meta = Record<string, unknown>;

// biome-ignore lint/suspicious/noExplicitAny: callback can have any args
const useNewVariableWindowState = (initialProps: WindowProps, onComplete: (...args: any[]) => void) => {
	const [meta, setMeta] = useState<Meta>({});
	const [dynamicProps, setDynamicProps] = useState<WindowProps>({});
	const [windowOpen, setWindowOpen] = useState(false);
	const handleOnComplete = useRef<((...args: unknown[]) => void) | null>(null);

	const closeWindow = useCallback(() => setWindowOpen(false), []);

	useEffect(() => {
		// biome-ignore lint/suspicious/noExplicitAny: callback can have any args
		handleOnComplete.current = (...args: any[]) => {
			onComplete(...args, meta);
			closeWindow();
		};
	}, [meta, closeWindow, onComplete]);

	const openWindow = (newProps: WindowProps, newMeta: Meta) => {
		setDynamicProps((prevProps) => ({
			...prevProps,
			...newProps,
		}));
		setMeta(newMeta);
		setWindowOpen(true);
	};

	const windowProps = {
		onComplete: (id: string) => handleOnComplete.current?.(id),
		onCancel: closeWindow,
		show: windowOpen,
		...initialProps,
		...dynamicProps,
	};

	return [windowProps, openWindow, closeWindow] as const;
};

export default useNewVariableWindowState;
