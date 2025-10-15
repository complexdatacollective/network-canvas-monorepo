import type React from "react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

interface ZoomPanViewportProps {
	children: ReactNode;
	zoom: number;
	pan: { x: number; y: number };
	onZoom: (delta: number, centerX: number, centerY: number) => void;
	onPan: (deltaX: number, deltaY: number) => void;
	className?: string;
	zoomConfig: {
		baseScaleFactor: number;
		mouseWheel: number;
		trackpadPinch: number;
		pointerPinch: number;
		keyboard: number;
	};
}

export function ZoomPanViewport({
	children,
	zoom,
	pan,
	onZoom,
	onPan,
	className = "",
	zoomConfig,
}: ZoomPanViewportProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const lastMousePos = useRef({ x: 0, y: 0 });
	const pointerCache = useRef<PointerEvent[]>([]);
	const prevDist = useRef(-1);
	const initialPinchDist = useRef(-1);
	const initialZoom = useRef(1);
	const pinchCenter = useRef({ x: 0, y: 0 });

	// Handle wheel event for panning (with Ctrl/Cmd for zoom)
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const wheelHandler = (e: WheelEvent) => {
			e.preventDefault();

			if (e.ctrlKey || e.metaKey) {
				// Zoom with Ctrl/Cmd + scroll (includes trackpad pinch on macOS)
				const rect = container.getBoundingClientRect();
				const centerX = e.clientX - rect.left - rect.width / 2;
				const centerY = e.clientY - rect.top - rect.height / 2;

				// Trackpad pinch gestures have fractional deltaY values
				// Mouse wheel has larger integer values (usually multiples of 100)
				const isPinch = Math.abs(e.deltaY) < 50 && e.deltaY % 1 !== 0;

				// Scale the deltaY to a zoom delta using centralized configuration
				const multiplier = isPinch
					? zoomConfig.baseScaleFactor * zoomConfig.trackpadPinch
					: zoomConfig.baseScaleFactor * zoomConfig.mouseWheel;
				const delta = -e.deltaY * multiplier;
				onZoom(delta, centerX, centerY);
			} else {
				// Pan with regular scroll
				onPan(-e.deltaX, -e.deltaY);
			}
		};

		container.addEventListener("wheel", wheelHandler, { passive: false });

		return () => {
			container.removeEventListener("wheel", wheelHandler);
		};
	}, [onZoom, onPan, zoomConfig]);

	// Handle pointer down (start panning or pinch)
	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		const container = containerRef.current;
		if (!container) return;

		// Add this event to the cache
		pointerCache.current.push(e.nativeEvent);

		if (pointerCache.current.length === 1) {
			// Single pointer - start panning
			isDragging.current = true;
			lastMousePos.current = { x: e.clientX, y: e.clientY };
			container.setPointerCapture(e.pointerId);

			// Prevent text selection during dragging
			document.body.style.userSelect = "none";
		}
	}, []);

	// Handle pointer move (panning or pinch zoom)
	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			// Update pointer cache
			const index = pointerCache.current.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
			if (index !== -1) {
				pointerCache.current[index] = e.nativeEvent;
			}

			if (pointerCache.current.length === 2) {
				// Two pointers - pinch zoom
				const point1 = pointerCache.current[0];
				const point2 = pointerCache.current[1];

				if (!point1 || !point2) return;

				// Calculate distance between pointers
				const curDist = Math.sqrt((point2.clientX - point1.clientX) ** 2 + (point2.clientY - point1.clientY) ** 2);

				// Initialize pinch gesture
				if (initialPinchDist.current < 0) {
					initialPinchDist.current = curDist;
					initialZoom.current = zoom;

					// Calculate and store the pinch center
					const rect = containerRef.current?.getBoundingClientRect();
					if (rect) {
						pinchCenter.current = {
							x: (point1.clientX + point2.clientX) / 2 - rect.left - rect.width / 2,
							y: (point1.clientY + point2.clientY) / 2 - rect.top - rect.height / 2,
						};
					}
				}

				// Calculate zoom based on distance ratio from initial pinch
				const distanceRatio = curDist / initialPinchDist.current;

				// Apply dead zone to prevent jittery behavior
				const deadZone = 0.05; // Large dead zone
				if (Math.abs(distanceRatio - 1) > deadZone) {
					// Use centralized configuration for pointer pinch sensitivity
					const zoomMultiplier = zoomConfig.baseScaleFactor * zoomConfig.pointerPinch;
					const targetZoom = initialZoom.current * (1 + (distanceRatio - 1) * zoomMultiplier);

					// Calculate the delta needed to reach target zoom
					const delta = targetZoom - zoom;

					// Apply the zoom change with consistent center point
					if (Math.abs(delta) > 0.001) {
						onZoom(delta, pinchCenter.current.x, pinchCenter.current.y);
					}
				}
			} else if (pointerCache.current.length === 1 && isDragging.current) {
				// Single pointer - pan
				const deltaX = e.clientX - lastMousePos.current.x;
				const deltaY = e.clientY - lastMousePos.current.y;

				onPan(deltaX, deltaY);

				lastMousePos.current = { x: e.clientX, y: e.clientY };
			}
		},
		[onPan, onZoom, zoom, zoomConfig],
	);

	// Handle pointer up
	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		// Remove this pointer from cache
		const index = pointerCache.current.findIndex((cachedEv) => cachedEv.pointerId === e.pointerId);
		if (index !== -1) {
			pointerCache.current.splice(index, 1);
		}

		// Reset states when no pointers
		if (pointerCache.current.length === 0) {
			isDragging.current = false;
			prevDist.current = -1;
			document.body.style.userSelect = "";
		}

		// Handle end of pinch gesture
		if (pointerCache.current.length < 2 && initialPinchDist.current > 0) {
			// Reset pinch state
			initialPinchDist.current = -1;
			initialZoom.current = 1;
		}

		// Release pointer capture
		containerRef.current?.releasePointerCapture(e.pointerId);
	}, []);

	// Handle pointer cancel
	const handlePointerCancel = useCallback(
		(e: React.PointerEvent) => {
			handlePointerUp(e);
		},
		[handlePointerUp],
	);

	// Add keyboard support for zoom
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const keyboardDelta = zoomConfig.baseScaleFactor * zoomConfig.keyboard;
			if (e.key === "+" || e.key === "=") {
				onZoom(keyboardDelta, 0, 0);
			} else if (e.key === "-") {
				onZoom(-keyboardDelta, 0, 0);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onZoom, zoomConfig]);

	return (
		<div
			ref={containerRef}
			className={`relative overflow-hidden cursor-grab active:cursor-grabbing ${className}`}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			style={{
				touchAction: "none", // Prevent default touch behaviors
			}}
		>
			<div
				style={{
					transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
					transformOrigin: "center center",
					transition: isDragging.current || pointerCache.current.length > 1 ? "none" : "transform 0.1s ease-out",
				}}
			>
				{children}
			</div>
		</div>
	);
}
