declare module "react-grid-layout" {
	import type { ComponentType, ReactNode } from "react";

	export type Layout = {
		i: string;
		x: number;
		y: number;
		w: number;
		h: number;
		minW?: number;
		maxW?: number;
		minH?: number;
		maxH?: number;
		static?: boolean;
		isDraggable?: boolean;
		isResizable?: boolean;
	};

	export type ReactGridLayoutProps = {
		className?: string;
		style?: React.CSSProperties;
		width?: number;
		autoSize?: boolean;
		cols?: number;
		draggableCancel?: string;
		draggableHandle?: string;
		verticalCompact?: boolean;
		compactType?: "vertical" | "horizontal" | null;
		layout?: Layout[];
		margin?: [number, number];
		containerPadding?: [number, number] | null;
		rowHeight?: number;
		maxRows?: number;
		isDraggable?: boolean;
		isResizable?: boolean;
		isBounded?: boolean;
		useCSSTransforms?: boolean;
		transformScale?: number;
		preventCollision?: boolean;
		isDroppable?: boolean;
		resizeHandles?: ("s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne")[];
		onLayoutChange?: (layout: Layout[]) => void;
		onDragStart?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onDrag?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onDragStop?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onResizeStart?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onResize?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onResizeStop?: (
			layout: Layout[],
			oldItem: Layout,
			newItem: Layout,
			placeholder: Layout,
			event: MouseEvent,
			element: HTMLElement,
		) => void;
		onDrop?: (layout: Layout[], item: Layout, event: DragEvent) => void;
		children?: ReactNode;
	};

	export type WidthProviderProps = {
		measureBeforeMount?: boolean;
		className?: string;
		style?: React.CSSProperties;
	};

	export function WidthProvider<P extends object>(
		WrappedComponent: ComponentType<P>,
	): ComponentType<Omit<P, "width"> & WidthProviderProps>;

	const ReactGridLayout: ComponentType<ReactGridLayoutProps>;
	export default ReactGridLayout;
}
