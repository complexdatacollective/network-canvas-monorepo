import { Component, createRef } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

import GridItem from './GridItem';
import {
  convertSize,
  type GridItem as GridItemData,
  getLayout,
  trimSize,
} from './helpers';
import withItems from './withItems';

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
  width: number | null;
};

class Grid extends Component<GridProps, GridState> {
  private containerRef = createRef<HTMLDivElement>();
  private resizeObserver?: ResizeObserver;

  state: GridState = { width: null };

  componentDidMount() {
    this.resizeObserver = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured == null) {
        return;
      }
      this.setState((prev) =>
        prev.width === measured ? null : { width: measured },
      );
    });
    if (this.containerRef.current) {
      this.resizeObserver.observe(this.containerRef.current);
    }
  }

  componentWillUnmount() {
    this.resizeObserver?.disconnect();
  }

  handleDragStop = (layout: Layout[], from: Layout) => {
    const { fields, items } = this.props;
    const newOrder = layout.toSorted((a, b) => a.y - b.y).map(({ i }) => i);
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

  render() {
    const {
      items,
      capacity,
      previewComponent,
      onEditItem,
      fields,
      meta,
      editField = '',
    } = this.props;

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
      <div>
        <div
          ref={this.containerRef}
          className="bg-surface-accent h-162.5 overflow-hidden rounded-lg"
        >
          {width !== null && (
            <GridLayout
              layout={getLayout(items, capacity)}
              cols={1}
              rowHeight={150}
              autoSize={false}
              width={width}
              onDragStop={this.handleDragStop}
              onResizeStop={this.handleResizeStop}
              draggableCancel=".grid-item-action"
              resizeHandle={(axis, ref) => (
                <span
                  ref={ref as React.Ref<HTMLSpanElement>}
                  className={`react-resizable-handle react-resizable-handle-${axis} after:hidden`}
                >
                  <span
                    aria-hidden="true"
                    className="rounded-br-base absolute right-0 bottom-0 block size-7 border-r-2 border-b-2 border-solid border-(--color-active)"
                  />
                </span>
              )}
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
          )}
        </div>

        {showError && (
          <p
            className={cx(
              'bg-error text-primary-foreground mt-(--space-md) flex items-center gap-(--space-sm) overflow-hidden rounded p-(--space-sm) transition-all duration-(--animation-duration-standard) ease-(--animation-easing)',
              'max-h-12.5 opacity-100',
              '[&_.icon]:h-(--space-md)!',
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
