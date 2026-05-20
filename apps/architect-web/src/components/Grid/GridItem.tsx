import Icon from '~/lib/legacy-ui/components/Icon';

type GridItemProps = {
  fields: {
    name: string;
    remove: (index: number) => void;
  };
  onEditItem: (fieldId: string) => void;
  previewComponent: React.ComponentType<Record<string, unknown>>;
  index: number;
  id: string;
} & Record<string, unknown>;

const GridItem = ({
  fields,
  onEditItem,
  previewComponent: PreviewComponent,
  index,
  id,
  ...rest
}: GridItemProps) => {
  const fieldId = `${fields.name}[${index}]`;

  if (!PreviewComponent) {
    return null;
  }

  return (
    <div>
      <div className="bg-sortable-background text-sortable-foreground absolute flex size-full items-stretch justify-start overflow-hidden rounded">
        <div className="flex grow basis-full items-center overflow-y-auto px-(--space-xl) py-(--space-md) [&_div]:size-full">
          <PreviewComponent
            id={id}
            // eslint-disable-next-line react/jsx-props-no-spreading
            {...rest}
          />
        </div>
        <div className="flex flex-initial items-center gap-(--space-sm) p-(--space-sm)">
          <button
            className="grid-item-action hover:bg-foreground/10 flex cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-(--space-sm) text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) [&_.icon]:size-(--space-md)!"
            onClick={() => onEditItem(fieldId)}
            type="button"
          >
            <Icon name="edit" />
          </button>
          <button
            className="grid-item-action hover:bg-error/20 ml-(--space-sm) flex cursor-pointer items-center justify-center rounded-xs border-none bg-transparent p-(--space-sm) text-inherit transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) [&_.icon]:size-(--space-md)!"
            onClick={() => fields.remove(index)}
            type="button"
          >
            <Icon name="delete" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GridItem;
