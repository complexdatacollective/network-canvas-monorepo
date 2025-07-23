import type React from "react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

interface ZoomPanViewportProps {
	children: ReactNode;
	zoom: number;
	pan: { x: number; y: number };
	onZoom: (delta: number, centerX: number, centerY: number) => void;
	onPan: (deltaX: number, deltaY: number) => void;
	className?: string;
}

export function ZoomPanViewport({ children, zoom, pan, onZoom, onPan, className = "" }: ZoomPanViewportProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const lastMousePos = useRef({ x: 0, y: 0 });

	// Add wheel event listener with proper passive handling
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const wheelHandler = (e: WheelEvent) => {
			e.preventDefault();

			const rect = container.getBoundingClientRect();
			const centerX = e.clientX - rect.left - rect.width / 2;
			const centerY = e.clientY - rect.top - rect.height / 2;

			// Determine zoom direction and magnitude
			const delta = e.deltaY > 0 ? -0.1 : 0.1;

			onZoom(delta, centerX, centerY);
		};

		container.addEventListener("wheel", wheelHandler, { passive: false });

		return () => {
			container.removeEventListener("wheel", wheelHandler);
		};
	}, [onZoom]);

	// Handle mouse down (start panning)
	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return; // Only left mouse button

		isDragging.current = true;
		lastMousePos.current = { x: e.clientX, y: e.clientY };

		// Prevent text selection during dragging
		document.body.style.userSelect = "none";
	}, []);

	// Handle mouse move (panning)
	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!isDragging.current) return;

			const deltaX = e.clientX - lastMousePos.current.x;
			const deltaY = e.clientY - lastMousePos.current.y;

			onPan(deltaX, deltaY);

			lastMousePos.current = { x: e.clientX, y: e.clientY };
		},
		[onPan],
	);

	// Handle mouse up (stop panning)
	const handleMouseUp = useCallback(() => {
		isDragging.current = false;
		document.body.style.userSelect = "";
	}, []);

	// Handle mouse leave (stop panning if dragging)
	const handleMouseLeave = useCallback(() => {
		if (isDragging.current) {
			isDragging.current = false;
			document.body.style.userSelect = "";
		}
	}, []);

	return (
		<div
			ref={containerRef}
			className={`relative overflow-hidden cursor-grab active:cursor-grabbing ${className}`}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseLeave}
			style={{
				touchAction: "none", // Prevent default touch behaviors
			}}
		>
			<div
				style={{
					transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
					transformOrigin: "center center",
					transition: isDragging.current ? "none" : "transform 0.1s ease-out",
				}}
			>
				{children}
			</div>
		</div>
	);
}
