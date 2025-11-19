declare module "react-grid-layout" {
	import type * as React from "react";

	export interface Layout {
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
		resizeHandles?: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">;
	}

	export interface GridLayoutProps {
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
		isBounded?: boolean;
		isDraggable?: boolean;
		isResizable?: boolean;
		isDroppable?: boolean;
		preventCollision?: boolean;
		useCSSTransforms?: boolean;
		transformScale?: number;
		droppingItem?: Partial<Layout>;
		resizeHandles?: Array<"s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne">;
		onLayoutChange?: (layout: Layout[]) => void;
		onDragStart?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onDrag?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onDragStop?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onResizeStart?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onResize?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onResizeStop?: (layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) => void;
		onDrop?: (layout: Layout[], item: Layout, event: Event) => void;
		children?: React.ReactNode;
		height?: number;
	}

	export default class GridLayout extends React.Component<GridLayoutProps> {}
}
