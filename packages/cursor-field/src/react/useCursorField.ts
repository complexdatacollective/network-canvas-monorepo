import { useCallback, useEffect, useRef, useState } from "react";
import type { CursorFieldConfig } from "../config";
import { CursorFieldCore } from "../core";
import type { ConnectionState, CursorId, InterpolatedCursor } from "../types";

export interface UseCursorFieldOptions extends CursorFieldConfig {
	/**
	 * Container element ref.
	 */
	containerRef: React.RefObject<HTMLElement | null>;

	/**
	 * Whether to automatically start on mount.
	 * @default true
	 */
	autoStart?: boolean;
}

export type UseCursorFieldResult = {
	/**
	 * Current connection state.
	 */
	connectionState: ConnectionState;

	/**
	 * Number of connected cursors.
	 */
	cursorCount: number;

	/**
	 * All cursor states (including interpolated positions).
	 */
	cursors: Map<CursorId, InterpolatedCursor>;

	/**
	 * Own cursor ID.
	 */
	ownCursorId: CursorId | null;

	/**
	 * Manually start the connection.
	 */
	start: () => void;

	/**
	 * Manually stop the connection.
	 */
	stop: () => void;

	/**
	 * Update configuration at runtime.
	 */
	updateConfig: (config: Partial<CursorFieldConfig>) => void;
};

export function useCursorField(options: UseCursorFieldOptions): UseCursorFieldResult {
	const { containerRef, autoStart = true, ...config } = options;

	const coreRef = useRef<CursorFieldCore | null>(null);
	const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
	const [cursorCount, setCursorCount] = useState(0);
	const [cursors, setCursors] = useState<Map<CursorId, InterpolatedCursor>>(new Map());
	const [ownCursorId, setOwnCursorId] = useState<CursorId | null>(null);

	const start = useCallback(() => {
		void coreRef.current?.start();
	}, []);

	const stop = useCallback(() => {
		coreRef.current?.stop();
	}, []);

	const updateConfig = useCallback((newConfig: Partial<CursorFieldConfig>) => {
		coreRef.current?.updateConfig(newConfig);
	}, []);

	useEffect(() => {
		if (!containerRef.current) return;

		const core = new CursorFieldCore(containerRef.current, {
			...config,
			onConnectionChange: setConnectionState,
			onCursorCountChange: setCursorCount,
		});

		coreRef.current = core;

		const unsubscribe = core.subscribe((newCursors) => {
			setCursors(new Map(newCursors));
		});

		core.onOwnCursorIdChange((id) => {
			setOwnCursorId(id);
		});

		if (autoStart) {
			void core.start();
		}

		return () => {
			unsubscribe();
			core.destroy();
			coreRef.current = null;
		};
	}, [containerRef.current, config.partyHost, config.room, autoStart]);

	return {
		connectionState,
		cursorCount,
		cursors,
		ownCursorId,
		start,
		stop,
		updateConfig,
	};
}
