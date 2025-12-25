import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CursorFieldConfig } from "../config";
import { DEFAULT_CONFIG } from "../config";
import { CursorFieldCore } from "../core";
import { FlagResolver } from "../rendering/FlagResolver";
import type { ConnectionState, CursorId, InterpolatedCursor } from "../types";
import { LocalUserCursor } from "./LocalUserCursor";

export interface CursorFieldProps extends CursorFieldConfig {
	/**
	 * CSS class for the container element.
	 */
	className?: string;

	/**
	 * Whether the component is enabled.
	 * @default true
	 */
	enabled?: boolean;
}

const flagResolver = new FlagResolver();

function isTouchOnlyDevice(): boolean {
	return "ontouchstart" in window && !window.matchMedia("(pointer: fine)").matches;
}

export function CursorField({ className, enabled = true, ...config }: CursorFieldProps): React.ReactNode {
	const containerRef = useRef<HTMLDivElement>(null);
	const coreRef = useRef<CursorFieldCore | null>(null);
	const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
	const [cursorCount, setCursorCount] = useState(0);
	const [cursors, setCursors] = useState<Map<CursorId, InterpolatedCursor>>(new Map());
	const [ownCursorId, setOwnCursorId] = useState<CursorId | null>(null);

	const handleConnectionChange = useCallback(
		(state: ConnectionState) => {
			setConnectionState(state);
			config.onConnectionChange?.(state);
		},
		[config.onConnectionChange],
	);

	const handleCursorCountChange = useCallback(
		(count: number) => {
			setCursorCount(count);
			config.onCursorCountChange?.(count);
		},
		[config.onCursorCountChange],
	);

	const ownCountryCode = useMemo(() => {
		if (!ownCursorId) return "XX";
		const ownCursor = cursors.get(ownCursorId);
		return ownCursor?.countryCode ?? "XX";
	}, [cursors, ownCursorId]);

	const ownFlag = useMemo(() => flagResolver.resolve(ownCountryCode), [ownCountryCode]);

	useEffect(() => {
		if (!containerRef.current || !enabled) {
			return;
		}

		if (isTouchOnlyDevice()) {
			return;
		}

		const core = new CursorFieldCore(containerRef.current, {
			...config,
			onConnectionChange: handleConnectionChange,
			onCursorCountChange: handleCursorCountChange,
		});

		coreRef.current = core;

		const unsubscribe = core.subscribe((newCursors) => {
			setCursors(new Map(newCursors));
		});

		core.onOwnCursorIdChange((id) => {
			setOwnCursorId(id);
		});

		void core.start();

		return () => {
			unsubscribe();
			core.destroy();
			coreRef.current = null;
		};
	}, [enabled, config.partyHost, config.room, handleConnectionChange, handleCursorCountChange]);

	useEffect(() => {
		if (coreRef.current) {
			coreRef.current.updateConfig(config);
		}
	}, [
		config.lineThreshold,
		config.lineWidth,
		config.lineColour,
		config.lineMaxOpacity,
		config.cursorSize,
		config.showOwnCursor,
		config.updateInterval,
	]);

	if (!enabled) {
		return null;
	}

	const showOwnCursor = config.showOwnCursor ?? DEFAULT_CONFIG.showOwnCursor;

	return (
		<>
			<div
				ref={containerRef}
				className={className}
				style={{
					position: "fixed",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					pointerEvents: "none",
					zIndex: config.zIndex ?? 9999,
				}}
				data-connection-state={connectionState}
				data-cursor-count={cursorCount}
			/>
			{showOwnCursor && (
				<LocalUserCursor flag={ownFlag} size={config.cursorSize ?? DEFAULT_CONFIG.cursorSize} visible />
			)}
		</>
	);
}
