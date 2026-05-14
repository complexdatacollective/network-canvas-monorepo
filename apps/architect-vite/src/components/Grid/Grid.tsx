import { throttle } from "es-toolkit/compat";
import React, { Component } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import Icon from "~/lib/legacy-ui/components/Icon";
import { cx } from "~/utils/cva";
import GridItem from "./GridItem";
import { convertSize, type GridItem as GridItemData, getLayout, trimSize } from "./helpers";
import withItems from "./withItems";

type FieldArrayApi = {
	name: string;
	swap: (indexA: number, indexB: number) => void;
	splice: (index: number, removeNum: number, value?: unknown) => void;
	remove: (index: number) => void;
};

type GridProps = {
	fields: FieldArrayApi;
	items: GridItemData[];
	capacity: number;
	previewComponent: React.ComponentType<Record<string, unknown>>;
	onEditItem: (item: string) => void;
	meta: {
		error?: React.ReactNode;
		submitFailed?: boolean;
		[key: string]: unknown;
	};
	editField?: string;
	form: string;
	fieldName?: string;
};

type GridState = {
	width: number;
};

class Grid extends Component<GridProps, GridState> {
	private ref = React.createRef<HTMLDivElement>();
	private resizeSensor?: NodeJS.Timeout;

	constructor(props: GridProps) {
		super(props);

		this.state = {
			width: 100,
		};
	}

	componentDidMount() {
		this.resizeSensor = setInterval(this.checkSize, 50);
	}

	componentWillUnmount() {
		clearInterval(this.resizeSensor);
	}

	setWidth = throttle((width: number) => {
		this.setState({ width });
	}, 500);

	handleDragStop = (layout: Layout[], from: Layout) => {
		const { fields, items } = this.props;
		const newOrder = layout.sort((a, b) => a.y - b.y).map(({ i }) => i);
		const oldIndex = items.findIndex(({ id }) => id === from.i);
		const newIndex = newOrder.indexOf(from.i);
		if (oldIndex === newIndex) {
			return;
		}
		fields.swap(oldIndex, newIndex);
	};

	handleResizeStop = (_layout: Layout[], from: Layout, to: Layout) => {
		const { fields, items, capacity } = this.props;
		const index = items.findIndex(({ id }) => id === from.i);
		const size = convertSize(trimSize(from.h, to.h, items, capacity));

		const newItem = {
			...items[index],
			size,
		};
		fields.splice(index, 1, newItem);
	};

	checkSize = () => {
		const { width } = this.state;
		if (!this.ref.current) {
			return;
		}

		const parent = this.ref.current.parentElement;
		if (!parent) {
			return;
		}

		const nextWidth = parent.offsetWidth;

		if (width !== nextWidth) {
			this.setWidth(nextWidth);
		}
	};

	render() {
		const { items, capacity, previewComponent, onEditItem, fields, meta, editField = "" } = this.props;

		const { error, submitFailed } = meta;

		const { width } = this.state;

		const showError = Boolean(submitFailed && error);

		if (!items) {
			return (
				<div>
					<p>
						<em>Currently no items.</em>
					</p>
				</div>
			);
		}

		return (
			<div ref={this.ref}>
				<GridLayout
					className="h-[450px] bg-surface-accent rounded-lg"
					layout={getLayout(items, capacity)}
					cols={1}
					rowHeight={100}
					autoSize={false}
					width={width}
					onDragStop={this.handleDragStop}
					onResizeStop={this.handleResizeStop}
				>
					{items.map(({ id, ...item }, index) => (
						<div key={id} className="relative">
							<GridItem
								id={id}
								index={index}
								fields={fields}
								previewComponent={previewComponent}
								onEditItem={onEditItem}
								editField={editField}
								// eslint-disable-next-line react/jsx-props-no-spreading
								{...item}
							/>
						</div>
					))}
				</GridLayout>

				{showError && (
					<p
						className={cx(
							"flex items-center gap-(--space-sm) bg-error text-primary-foreground rounded p-(--space-sm) mt-(--space-md) overflow-hidden transition-all duration-(--animation-duration-standard) ease-(--animation-easing)",
							"max-h-[50px] opacity-100",
							"[&_.icon]:h-(--space-md)!",
						)}
					>
						<Icon name="warning" /> {error}
					</p>
				)}
			</div>
		);
	}
}

export default withItems(Grid);
