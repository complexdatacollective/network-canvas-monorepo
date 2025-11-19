import { Flipped } from "react-flip-toolkit";
import Icon from "~/lib/legacy-ui/components/Icon";

type GridItemProps = {
	fields: {
		name: string;
		remove: (index: number) => void;
	};
	editField?: string | null;
	onEditItem: (fieldId: string) => void;
	previewComponent: React.ComponentType<Record<string, unknown>>;
	index: number;
	id: string;
} & Record<string, unknown>;

const GridItem = ({
	fields,
	editField = null,
	onEditItem,
	previewComponent: PreviewComponent,
	index,
	id,
	...rest
}: GridItemProps) => {
	const fieldId = `${fields.name}[${index}]`;
	const flipId = editField === fieldId ? `_${fieldId}` : fieldId;

	if (!PreviewComponent) {
		return null;
	}

	return (
		<div>
			<Flipped flipId={flipId}>
				<div className="grid-item">
					<div className="grid-item__content">
						<PreviewComponent
							id={id}
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...rest}
						/>
					</div>
					<div className="grid-item__controls">
						<button
							className="grid-item__edit"
							onMouseDown={(e) => {
								e.stopPropagation();
								e.preventDefault();
								onEditItem(fieldId);
							}}
							type="button"
						>
							<Icon name="edit" color="sea-green" />
						</button>
						<button
							className="grid-item__delete"
							onMouseDown={(e) => {
								e.stopPropagation();
								e.preventDefault();
								fields.remove(index);
							}}
							type="button"
						>
							<Icon name="delete" />
						</button>
					</div>
				</div>
			</Flipped>
		</div>
	);
};

export default GridItem;
