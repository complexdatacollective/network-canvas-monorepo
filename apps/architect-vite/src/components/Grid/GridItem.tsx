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
				<div className="absolute size-full flex items-stretch justify-start bg-sortable-background text-sortable-foreground rounded overflow-hidden">
					<div className="grow basis-full flex items-center overflow-y-auto px-(--space-xl) py-(--space-md) [&_div]:size-full [&_.assets]:bg-sortable-background [&_.assets]:text-sortable-foreground [&_.assets]:h-auto">
						<PreviewComponent
							id={id}
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...rest}
						/>
					</div>
					<div className="flex-initial flex items-center p-(--space-sm) gap-(--space-sm)">
						<button
							className="cursor-pointer p-(--space-sm) rounded-xs flex items-center justify-center bg-transparent border-none text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) hover:bg-foreground/10 [&_.icon]:size-(--space-md)!"
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
							className="cursor-pointer p-(--space-sm) rounded-xs flex items-center justify-center bg-transparent border-none text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) hover:bg-error/20 ml-(--space-sm) [&_.icon]:size-(--space-md)! [&_.icon_.cls-1]:fill-sortable-foreground [&_.icon_.cls-2]:fill-sortable-foreground"
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
