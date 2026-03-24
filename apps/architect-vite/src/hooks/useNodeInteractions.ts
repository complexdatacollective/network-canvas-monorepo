import { useAnimate } from "motion/react";
import { type CSSProperties, useCallback, useState } from "react";

type UseNodeInteractionsOptions = {
	hasClickHandler?: boolean;
	disabled?: boolean;
};

type UseNodeInteractionsReturn = {
	scope: React.RefObject<HTMLElement | null>;
	nodeProps: {
		onPointerDown: (e: React.PointerEvent) => void;
		onPointerUp: (e: React.PointerEvent) => void;
		onPointerCancel: (e: React.PointerEvent) => void;
		onPointerLeave: (e: React.PointerEvent) => void;
		onKeyDown: (e: React.KeyboardEvent) => void;
		onKeyUp: (e: React.KeyboardEvent) => void;
		style: CSSProperties;
	};
	isPressed: boolean;
};

export function useNodeInteractions(options: UseNodeInteractionsOptions = {}): UseNodeInteractionsReturn {
	const { hasClickHandler = false, disabled = false } = options;

	const [scope, animate] = useAnimate<HTMLElement>();
	const [isPressed, setIsPressed] = useState(false);

	const enablePressAnimation = hasClickHandler && !disabled;

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (disabled) return;
			if (e.button !== 0) return;

			if (enablePressAnimation && scope.current) {
				setIsPressed(true);
				animate(scope.current, { scale: 0.92 });
			}
		},
		[disabled, enablePressAnimation, animate, scope],
	);

	const resetPress = useCallback(() => {
		if (!isPressed) return;
		setIsPressed(false);

		if (scope.current) {
			animate(scope.current, { scale: 1 }, { type: "spring", stiffness: 700, damping: 20 });
		}
	}, [isPressed, animate, scope]);

	const handlePointerUp = useCallback(
		(_e: React.PointerEvent) => {
			resetPress();
		},
		[resetPress],
	);

	const handlePointerCancel = useCallback(
		(_e: React.PointerEvent) => {
			resetPress();
		},
		[resetPress],
	);

	const handlePointerLeave = useCallback(
		(_e: React.PointerEvent) => {
			resetPress();
		},
		[resetPress],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (disabled) return;
			if (e.key !== "Enter" && e.key !== " ") return;
			if (e.repeat) return;

			if (enablePressAnimation && scope.current) {
				setIsPressed(true);
				animate(scope.current, { scale: 0.92 });
			}
		},
		[disabled, enablePressAnimation, animate, scope],
	);

	const handleKeyUp = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			resetPress();
		},
		[resetPress],
	);

	return {
		scope,
		nodeProps: {
			onPointerDown: handlePointerDown,
			onPointerUp: handlePointerUp,
			onPointerCancel: handlePointerCancel,
			onPointerLeave: handlePointerLeave,
			onKeyDown: handleKeyDown,
			onKeyUp: handleKeyUp,
			style: {
				touchAction: "manipulation",
				userSelect: "none",
			},
		},
		isPressed,
	};
}
