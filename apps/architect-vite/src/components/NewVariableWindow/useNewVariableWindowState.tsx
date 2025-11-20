import { useCallback, useEffect, useRef, useState } from "react";

type WindowProps = Record<string, unknown>;
type Meta = Record<string, unknown>;

const useNewVariableWindowState = (initialProps: WindowProps, onComplete: (...args: unknown[]) => void) => {
	const [meta, setMeta] = useState<Meta>({});
	const [dynamicProps, setDynamicProps] = useState<WindowProps>({});
	const [windowOpen, setWindowOpen] = useState(false);
	const handleOnComplete = useRef<(...args: unknown[]) => void>();

	const closeWindow = useCallback(() => setWindowOpen(false), []);

	useEffect(() => {
		handleOnComplete.current = (...args: unknown[]) => {
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
