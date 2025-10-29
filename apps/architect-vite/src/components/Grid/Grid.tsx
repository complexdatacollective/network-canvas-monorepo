import cx from "classnames";
import { throttle } from "lodash";
import React, { Component } from "react";
import GridLayout from "react-grid-layout";
import Icon from "~/lib/legacy-ui/components/Icon";
import GridItem from "./GridItem";
import { convertSize, getLayout, trimSize } from "./helpers";
import withItems from "./withItems";

interface GridProps {
	fields: Record<string, unknown>;
	items: Array<Record<string, unknown>>;
	capacity: number;
	previewComponent: React.ComponentType<any>;
	onEditItem: (item: any) => void;
	meta: Record<string, unknown>;
	editField?: string;
	form: string;
	fieldName?: string;
}

interface GridState {
	width: number;
}

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

	setWidth = throttle((width) => {
		this.setState({ width });
	}, 500);

	handleDragStop = (layout, from) => {
		const { fields, items } = this.props;
		const newOrder = layout.sort((a, b) => a.y - b.y).map(({ i }) => i);
		const oldIndex = items.findIndex(({ id }) => id === from.i);
		const newIndex = newOrder.indexOf(from.i);
		if (oldIndex === newIndex) {
			return;
		}
		fields.swap(oldIndex, newIndex);
	};

	handleResizeStop = (_layout, from, to) => {
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

		const nextWidth = this.ref.current.parentElement.offsetWidth;

		if (width !== nextWidth) {
			this.setWidth(nextWidth);
		}
	};

	render() {
		const { items, capacity, previewComponent, onEditItem, fields, meta, editField = "" } = this.props;

		const { error, submitFailed } = meta;

		const { width } = this.state;

		const gridClasses = cx("grid", {
			"grid--has-error": submitFailed && error,
		});

		if (!items) {
			return (
				<div className="grid">
					<p>
						<em>Currently no items.</em>
					</p>
				</div>
			);
		}

		return (
			<div className={gridClasses} ref={this.ref}>
				<GridLayout
					className="layout"
					layout={getLayout(items, capacity)}
					cols={1}
					rowHeight={100}
					autoSize={false}
					height={500}
					width={width}
					onDragStop={this.handleDragStop}
					onResizeStop={this.handleResizeStop}
				>
					{items.map(({ id, ...item }, index) => (
						<div key={id} className="grid__item">
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

				{submitFailed && error && (
					<p className="grid__error">
						<Icon name="warning" /> {error}
					</p>
				)}
			</div>
		);
	}
}

export default withItems(Grid);
