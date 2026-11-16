import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useMemo, useState, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Collection } from '../components/Collection';
import { GridLayout } from '../layout/GridLayout';
import { ListLayout } from '../layout/ListLayout';
import type { Key } from '../types';

type Item = {
  id: string;
  name: string;
};

const testItems: Item[] = [
  { id: '1', name: 'Apple' },
  { id: '2', name: 'Banana' },
  { id: '3', name: 'Cherry' },
  { id: '4', name: 'Date' },
  { id: '5', name: 'Elderberry' },
];

// Wrapper component for controlled selection
function ControlledCollection({
  items = testItems,
  selectionMode = 'multiple' as const,
  disabledKeys,
  disallowEmptySelection = false,
  layoutType = 'list' as 'list' | 'grid',
  onSelectionChange,
}: {
  items?: Item[];
  selectionMode?: 'none' | 'single' | 'multiple';
  disabledKeys?: Key[];
  disallowEmptySelection?: boolean;
  layoutType?: 'list' | 'grid';
  onSelectionChange?: (keys: Set<Key>) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<Key>>(new Set());

  // Use minItemWidth=250 to get 3 columns with 800px mock container width
  // Calculation: (800 + 8) / (250 + 8) = 3.13 → 3 columns
  const layout = useMemo(() => {
    if (layoutType === 'grid') {
      return new GridLayout<Item>({ minItemWidth: 250, gap: 2 });
    }
    return new ListLayout<Item>({ gap: 2 });
  }, [layoutType]);

  const handleSelectionChange = (keys: Set<Key>) => {
    setSelectedKeys(keys);
    onSelectionChange?.(keys);
  };

  return (
    <Collection
      items={items}
      keyExtractor={(item) => item.id}
      textValueExtractor={(item) => item.name}
      layout={layout}
      selectionMode={selectionMode}
      selectedKeys={selectedKeys}
      onSelectionChange={handleSelectionChange}
      disabledKeys={disabledKeys}
      disallowEmptySelection={disallowEmptySelection}
      aria-label="Test collection"
      renderItem={(item, itemProps) => (
        <div {...itemProps} data-testid={`item-${item.id}`}>
          {item.name}
        </div>
      )}
    >
      {(CollectionElements) => CollectionElements}
    </Collection>
  );
}

describe('Collection', () => {
  describe('rendering', () => {
    it('renders its items in the initial markup', () => {
      const markup = renderToString(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          animate={false}
          emptyState={<span>Nothing here</span>}
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      for (const item of testItems) {
        expect(markup).toContain(item.name);
      }
      expect(markup).not.toContain('Nothing here');
    });

    it('marks disabled native items in the initial markup', () => {
      const markup = renderToString(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="none"
          nativeItemSemantics
          disabledKeys={['2']}
          animate={false}
          renderItem={(item, itemProps) => (
            <a {...itemProps} href={`#${item.id}`}>
              {item.name}
            </a>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      const banana = markup.match(/<a[^>]*>Banana<\/a>/)?.[0] ?? '';
      const apple = markup.match(/<a[^>]*>Apple<\/a>/)?.[0] ?? '';
      expect(banana).toContain('aria-disabled="true"');
      expect(banana).toContain('tabindex="-1"');
      expect(apple).not.toContain('aria-disabled');
    });

    it('marks the initial selection in the initial markup', () => {
      const markup = renderToString(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="single"
          defaultSelectedKeys={['3']}
          animate={false}
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      const cherry = markup.match(/<div[^>]*>Cherry<\/div>/)?.[0] ?? '';
      const apple = markup.match(/<div[^>]*>Apple<\/div>/)?.[0] ?? '';
      expect(cherry).toContain('aria-selected="true"');
      expect(apple).not.toContain('aria-selected');
    });

    // The animated renderer's `AnimatePresence` is mounted with
    // `initial={false}`, so its children render in their `animate` state
    // rather than the hidden `initial` one. Without that, static output
    // would carry `opacity: 0` and stay invisible wherever the entrance
    // animation never runs (no JavaScript, or failed hydration).
    it('renders animated items visibly in the initial markup', () => {
      const markup = renderToString(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="none"
          nativeItemSemantics
          scrollable={false}
          animate
          animationKey="initial"
          renderItem={(item, itemProps) => (
            <a {...itemProps} href={`#${item.id}`}>
              {item.name}
            </a>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      const wrappers = markup.match(/style="[^"]*opacity:[^"]*"/g) ?? [];
      expect(wrappers).toHaveLength(testItems.length);
      for (const style of wrappers) {
        expect(style).toContain('opacity:1');
        expect(style).toContain('transform:none');
      }
    });

    it('keeps one-shot iterables of keys after mounting', async () => {
      function* disabled() {
        yield '2';
      }
      function* selected() {
        yield '3';
      }

      render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="single"
          defaultSelectedKeys={selected()}
          disabledKeys={disabled()}
          animate={false}
          aria-label="Fruit"
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      const option = (name: string) => screen.getByRole('option', { name });
      await waitFor(() => {
        expect(option('Banana').getAttribute('aria-disabled')).toBe('true');
      });
      expect(option('Cherry').getAttribute('aria-selected')).toBe('true');
      expect(option('Apple').getAttribute('aria-disabled')).toBeNull();
    });

    // StrictMode double-invokes the memo factories that materialize these
    // iterables. React keeps the first invocation's value, so a generator is
    // consumed once; without the memo the committed render would see an
    // exhausted iterator and silently drop the initial state.
    it('keeps one-shot iterables of keys under StrictMode', async () => {
      function* disabled() {
        yield '2';
      }
      function* selected() {
        yield '3';
      }

      render(
        <StrictMode>
          <Collection
            items={testItems}
            keyExtractor={(item) => item.id}
            textValueExtractor={(item) => item.name}
            layout={new ListLayout<Item>({ gap: 2 })}
            selectionMode="single"
            defaultSelectedKeys={selected()}
            disabledKeys={disabled()}
            animate={false}
            aria-label="Fruit"
            renderItem={(item, itemProps) => (
              <div {...itemProps}>{item.name}</div>
            )}
          >
            {(collectionElements) => collectionElements}
          </Collection>
        </StrictMode>,
      );

      const option = (name: string) => screen.getByRole('option', { name });
      await waitFor(() => {
        expect(option('Banana').getAttribute('aria-disabled')).toBe('true');
      });
      expect(option('Cherry').getAttribute('aria-selected')).toBe('true');
      expect(option('Apple').getAttribute('aria-disabled')).toBeNull();
    });

    it('renders in page flow without a scroll region when not scrollable', () => {
      const { container } = render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="none"
          nativeItemSemantics
          scrollable={false}
          animate={false}
          renderItem={(item, itemProps) => (
            <a {...itemProps} href={`#${item.id}`}>
              {item.name}
            </a>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      // No ScrollArea viewport: nothing between the items and the page that
      // could clip them or become a tab stop.
      expect(container.querySelector('section')).toBeNull();
      expect(container.querySelector('[tabindex]')).toBeNull();
      expect(screen.getAllByRole('link')).toHaveLength(testItems.length);
    });

    it('keeps the listbox on the plain container when not scrollable', () => {
      render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="single"
          scrollable={false}
          animate={false}
          aria-label="Fruit"
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(collectionElements) => collectionElements}
        </Collection>,
      );

      const listbox = screen.getByRole('listbox', { name: 'Fruit' });
      expect(listbox.tagName).toBe('DIV');
      expect(listbox.closest('section')).toBeNull();
    });

    it('preserves native link semantics when requested', () => {
      render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="none"
          nativeItemSemantics
          renderItem={(item, itemProps) => (
            <a {...itemProps} href={`#${item.id}`}>
              {item.name}
            </a>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(testItems.length);
      const firstLink = screen.getByRole('link', { name: 'Apple' });
      expect(firstLink).not.toHaveAttribute('tabindex');
      expect(firstLink.closest('section')).toHaveAttribute('tabindex', '-1');
    });

    it('blocks activation of disabled native links', async () => {
      const user = userEvent.setup();
      const onActivate = vi.fn();

      render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          selectionMode="none"
          nativeItemSemantics
          disabledKeys={['2']}
          renderItem={(item, itemProps) => (
            <a href={`#${item.id}`} onClick={onActivate} {...itemProps}>
              {item.name}
            </a>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );

      const disabledLink = screen.getByRole('link', { name: 'Banana' });
      expect(disabledLink).toHaveAttribute('aria-disabled', 'true');
      expect(disabledLink).toHaveAttribute('tabindex', '-1');

      await user.click(disabledLink);

      expect(onActivate).not.toHaveBeenCalled();
      expect(window.location.hash).not.toBe('#2');

      // The item props carry no `onClick` of their own in native mode, so the
      // consumer's handler survives being spread over — enabled links still
      // activate.
      await user.click(screen.getByRole('link', { name: 'Apple' }));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });

    it('should render empty state when no items', () => {
      const layout = new ListLayout<Item>({ gap: 2 });

      render(
        <Collection
          items={[]}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={layout}
          emptyState={<div data-testid="empty">No items</div>}
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );

      expect(screen.getByTestId('empty')).toBeInTheDocument();
    });

    // The default empty state is a message descriptor formatted here rather
    // than a default parameter on the prop, and a default parameter applies
    // to `undefined` alone. `emptyState` is a ReactNode, and passing `null`
    // is how a caller says the collection should show nothing at all when it
    // is empty — a nullish fallback would talk over them.
    function renderEmpty(emptyState?: ReactNode) {
      render(
        <Collection
          items={[]}
          keyExtractor={(item: Item) => item.id}
          textValueExtractor={(item: Item) => item.name}
          layout={new ListLayout<Item>({ gap: 2 })}
          emptyState={emptyState}
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );
    }

    it('shows nothing when a caller passes null as the empty state', () => {
      renderEmpty(null);

      expect(screen.queryByText('No items to display.')).toBeNull();
    });

    it('shows the default empty message when a caller passes no empty state', () => {
      renderEmpty(undefined);

      expect(screen.getByText('No items to display.')).toBeInTheDocument();
    });

    // A listbox may be empty, but may hold nothing other than options: the
    // empty state is drawn where items would be, so the list carries it as
    // its description and the text itself is out of the accessibility tree.
    it('gives an empty list its empty state as a description, not as content', () => {
      const layout = new ListLayout<Item>({ gap: 2 });

      render(
        <Collection
          items={[]}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={layout}
          aria-label="Added people"
          renderItem={(item, itemProps) => (
            <div {...itemProps}>{item.name}</div>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );

      const list = screen.getByRole('listbox', { name: 'Added people' });
      expect(list).toHaveAccessibleDescription('No items to display.');
      expect(screen.getByText('No items to display.')).toBeVisible();
      expect(
        screen.queryByText('No items to display.', { ignore: '[aria-hidden]' }),
      ).toBeNull();
    });

    it('marks only the disabled items', () => {
      render(<ControlledCollection disabledKeys={['2']} />);

      expect(screen.getByTestId('item-1')).not.toHaveAttribute('data-disabled');
      expect(screen.getByTestId('item-2')).toHaveAttribute(
        'data-disabled',
        'true',
      );
    });

    it('should apply ARIA attributes', () => {
      render(<ControlledCollection />);

      expect(screen.getByLabelText('Test collection')).toHaveAttribute(
        'aria-multiselectable',
        'true',
      );
    });
  });

  describe('selection', () => {
    describe('multiple selection', () => {
      it('reports the accumulated selection to a controlled caller', async () => {
        const user = userEvent.setup();
        const onSelectionChange = vi.fn();

        render(
          <ControlledCollection
            selectionMode="multiple"
            onSelectionChange={onSelectionChange}
          />,
        );

        await user.click(screen.getByTestId('item-2'));
        await user.click(screen.getByTestId('item-3'));

        expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['2', '3']));
      });

      it('reports every key to a controlled caller on Ctrl+A', async () => {
        const user = userEvent.setup();
        const onSelectionChange = vi.fn();

        render(
          <ControlledCollection
            selectionMode="multiple"
            onSelectionChange={onSelectionChange}
          />,
        );

        await user.click(screen.getByTestId('item-1'));
        await user.keyboard('{Control>}a{/Control}');

        expect(onSelectionChange).toHaveBeenLastCalledWith(
          new Set(['1', '2', '3', '4', '5']),
        );
      });
    });

    describe('disallowEmptySelection', () => {
      it('should not deselect last item when disallowEmptySelection is true', async () => {
        const user = userEvent.setup();
        const onSelectionChange = vi.fn();

        render(
          <ControlledCollection
            selectionMode="single"
            disallowEmptySelection={true}
            onSelectionChange={onSelectionChange}
          />,
        );

        // Select item
        await user.click(screen.getByTestId('item-2'));

        // Try to deselect - should not change
        const callCount = onSelectionChange.mock.calls.length;
        await user.click(screen.getByTestId('item-2'));

        // No additional call should have been made
        expect(onSelectionChange.mock.calls.length).toBe(callCount);
      });
    });

    describe('no selection mode', () => {
      it('should not select items when selectionMode is none', async () => {
        const user = userEvent.setup();
        const onSelectionChange = vi.fn();

        render(
          <ControlledCollection
            selectionMode="none"
            onSelectionChange={onSelectionChange}
          />,
        );

        await user.click(screen.getByTestId('item-2'));

        expect(onSelectionChange).not.toHaveBeenCalled();
      });
    });
  });

  describe('grid layout', () => {
    it('should support grid navigation with arrow keys', async () => {
      const user = userEvent.setup();
      render(<ControlledCollection layoutType="grid" />);

      // Click first item to focus
      await user.click(screen.getByTestId('item-1'));
      expect(screen.getByTestId('item-1').getAttribute('data-focused')).toBe(
        'true',
      );

      // Navigate right
      await user.keyboard('{ArrowRight}');
      expect(screen.getByTestId('item-2').getAttribute('data-focused')).toBe(
        'true',
      );

      // Navigate down (with 3 columns, goes to item 5 = 2 + 3)
      await user.keyboard('{ArrowDown}');
      expect(screen.getByTestId('item-5').getAttribute('data-focused')).toBe(
        'true',
      );
    });
  });

  describe('a collection whose elements are drawn later', () => {
    // A caller's render prop can leave the elements out at first (a tab not
    // yet open, data still loading). The container's width still has to be
    // measured once it appears, or a grid navigates as a single column.
    function LateCollection() {
      const [shown, setShown] = useState(false);
      const layout = useMemo(
        () => new GridLayout<Item>({ minItemWidth: 250, gap: 2 }),
        [],
      );
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Show
          </button>
          <Collection
            items={testItems}
            keyExtractor={(item) => item.id}
            textValueExtractor={(item) => item.name}
            layout={layout}
            selectionMode="single"
            aria-label="Late collection"
            renderItem={(item, itemProps) => (
              <div {...itemProps} data-testid={`item-${item.id}`}>
                {item.name}
              </div>
            )}
          >
            {(CollectionElements) => (shown ? CollectionElements : null)}
          </Collection>
        </>
      );
    }

    it('navigates its grid by row once the elements appear', async () => {
      const user = userEvent.setup();
      render(<LateCollection />);

      await user.click(screen.getByRole('button', { name: 'Show' }));
      await user.click(screen.getByTestId('item-1'));
      // With 3 columns at the mocked 800px width, down from item 1 is item 4.
      await user.keyboard('{ArrowDown}');
      await waitFor(() =>
        expect(screen.getByTestId('item-4').getAttribute('data-focused')).toBe(
          'true',
        ),
      );
    });
  });

  describe('uncontrolled selection', () => {
    it('should work with defaultSelectedKeys', () => {
      const layout = new ListLayout<Item>({ gap: 2 });

      render(
        <Collection
          items={testItems}
          keyExtractor={(item) => item.id}
          textValueExtractor={(item) => item.name}
          layout={layout}
          selectionMode="multiple"
          defaultSelectedKeys={['1', '3']}
          aria-label="Uncontrolled collection"
          renderItem={(item, itemProps) => (
            <div {...itemProps} data-testid={`item-${item.id}`}>
              {item.name}
            </div>
          )}
        >
          {(CollectionElements) => CollectionElements}
        </Collection>,
      );

      expect(screen.getByTestId('item-1').getAttribute('data-selected')).toBe(
        'true',
      );
      // Non-selected items don't have the data-selected attribute
      expect(
        screen.getByTestId('item-2').hasAttribute('data-selected'),
      ).toBeFalsy();
      expect(screen.getByTestId('item-3').getAttribute('data-selected')).toBe(
        'true',
      );
    });
  });
});
