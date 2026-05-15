import { Flipped } from 'react-flip-toolkit';

import Icon from '~/lib/legacy-ui/components/Icon';

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
        <div className="bg-sortable-background text-sortable-foreground absolute flex size-full items-stretch justify-start overflow-hidden rounded">
          <div className="[&_.assets]:bg-sortable-background [&_.assets]:text-sortable-foreground flex grow basis-full items-center overflow-y-auto px-(--space-xl) py-(--space-md) [&_.assets]:h-auto [&_div]:size-full">
            <PreviewComponent
              id={id}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...rest}
            />
          </div>
          <div className="flex flex-initial items-center gap-(--space-sm) p-(--space-sm)">
            <button
              className="hover:bg-foreground/10 flex cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-(--space-sm) text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) [&_.icon]:size-(--space-md)!"
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
              className="hover:bg-error/20 [&_.icon_.cls-1]:fill-sortable-foreground [&_.icon_.cls-2]:fill-sortable-foreground ml-(--space-sm) flex cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-(--space-sm) text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) [&_.icon]:size-(--space-md)!"
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
