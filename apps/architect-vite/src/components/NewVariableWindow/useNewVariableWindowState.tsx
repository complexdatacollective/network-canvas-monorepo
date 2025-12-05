import { useCallback, useEffect, useRef, useState } from "react";

type Entity = "node" | "edge" | "ego";

type NewVariableWindowInitialProps = {
	entity: Entity | string; // Will be cast to Entity internally
	type: string;
	initialValues?: Record<string, unknown> | null;
	allowVariableTypes?: string[] | null;
};

type DynamicProps = {
	initialValues?: Record<string, unknown> | null;
	[key: string]: unknown;
};

type Meta = Record<string, unknown>;

type NewVariableWindowProps = {
	entity: Entity;
	type: string;
	initialValues?: Record<string, unknown> | null;
	allowVariableTypes?: string[] | null;
	onComplete: (id: string) => void | undefined;
	onCancel: () => void;
	show: boolean;
};

// biome-ignore lint/suspicious/noExplicitAny: callback can have any args
const useNewVariableWindowState = (
	initialProps: NewVariableWindowInitialProps,
	onComplete: (...args: any[]) => void,
) => {
	const [meta, setMeta] = useState<Meta>({});
	const [dynamicProps, setDynamicProps] = useState<DynamicProps>({});
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

	const openWindow = (newProps: DynamicProps, newMeta: Meta) => {
		setDynamicProps((prevProps) => ({
			...prevProps,
			...newProps,
		}));
		setMeta(newMeta);
		setWindowOpen(true);
	};

	const windowProps: NewVariableWindowProps = {
		onComplete: (id: string) => handleOnComplete.current?.(id),
		onCancel: closeWindow,
		show: windowOpen,
		entity: initialProps.entity as Entity,
		type: initialProps.type,
		allowVariableTypes: initialProps.allowVariableTypes,
		initialValues: dynamicProps.initialValues ?? initialProps.initialValues,
	};

	return [windowProps, openWindow, closeWindow] as const;
};

export default useNewVariableWindowState;
