'use client';

import { LayoutTemplate } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@codaco/fresco-ui/Badge';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { CollectionFilterInput } from '@codaco/fresco-ui/collection/components/CollectionFilterInput';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import InterfacePicture from '@codaco/interface-images/InterfacePicture';
import manifest, {
  type InterfaceType,
} from '@codaco/interface-images/manifest';

export type StageSummary = {
  id: string;
  type: string;
  label?: string;
};

type StagesMenuProps = {
  /** Authored stages only (the appended FinishSession sentinel is excluded). */
  stages: StageSummary[];
  /** Index of the stage currently displayed, for the active marker. */
  currentStageIndex: number;
  /** Skipped state keyed by stage index (from `getSkipMap`). */
  skipMap: Record<number, boolean>;
  /** Called with the chosen stage index when an item is activated. */
  onSelect: (index: number) => void;
};

type StageItem = {
  id: string;
  index: number;
  type: string;
  label: string;
  position: string;
  isCurrent: boolean;
  isSkipped: boolean;
};

const isInterfaceType = (type: string): type is InterfaceType =>
  Object.hasOwn(manifest, type);

const keyExtractor = (item: StageItem) => item.id;
const textValueExtractor = (item: StageItem) => item.label;

export default function StagesMenu({
  stages,
  currentStageIndex,
  skipMap,
  onSelect,
}: StagesMenuProps) {
  const layout = useMemo(() => new ListLayout<StageItem>({ gap: 0 }), []);

  const items = useMemo<StageItem[]>(
    () =>
      stages.map((stage, index) => ({
        id: stage.id,
        index,
        type: stage.type,
        label: stage.label?.trim() ? stage.label : 'Untitled stage',
        position: String(index + 1),
        isCurrent: index === currentStageIndex,
        isSkipped: skipMap[index] === true,
      })),
    [stages, currentStageIndex, skipMap],
  );

  const currentId = items[currentStageIndex]?.id;

  const [matchingKeys, setMatchingKeys] = useState<Set<Key> | null>(null);
  const visible = useMemo(() => {
    const shown = matchingKeys
      ? items.filter((item) => matchingKeys.has(item.id))
      : items;
    return { firstId: shown.at(0)?.id, lastId: shown.at(-1)?.id };
  }, [items, matchingKeys]);

  const handleSelectionChange = (keys: Set<Key>) => {
    const [key] = keys;
    if (key === undefined) {
      return;
    }
    const item = items.find((candidate) => candidate.id === key);
    if (item) {
      onSelect(item.index);
    }
  };

  const renderItem = (item: StageItem, itemProps: ItemProps) => {
    const isFirst = item.id === visible.firstId;
    const isLast = item.id === visible.lastId;
    return (
      <button
        {...itemProps}
        type="button"
        aria-current={item.isCurrent ? 'step' : undefined}
        className={cx(
          'focusable relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'data-selected:bg-primary data-selected:text-primary-contrast',
          'hover:bg-accent data-focused:bg-accent',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'bg-neon-coral pointer-events-none absolute left-7 w-1 -translate-x-1/2',
            isFirst && isLast
              ? 'hidden'
              : isFirst
                ? 'top-1/2 bottom-0'
                : isLast
                  ? 'top-0 bottom-1/2'
                  : 'inset-y-0',
          )}
        />
        <span
          aria-hidden
          className="relative z-10 flex w-6 shrink-0 items-center justify-center"
        >
          <span
            className={cx(
              'bg-neon-coral rounded-full transition-all',
              item.isCurrent ? 'ring-neon-coral/30 size-4 ring-4' : 'size-3',
            )}
          />
        </span>
        <span className="aspect-video w-32 shrink-0 overflow-hidden rounded-xs [&>picture]:block [&>picture]:size-full">
          {isInterfaceType(item.type) ? (
            <InterfacePicture
              type={item.type}
              ratio="16:9"
              sizes="8rem"
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-black/20">
              <LayoutTemplate className="size-6 opacity-40" />
            </span>
          )}
        </span>
        <span className="text-sm font-bold tabular-nums opacity-70">
          {item.position}.
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold tracking-wider wrap-break-word uppercase">
          {item.label}
        </span>
        {item.isSkipped && (
          <Badge variant="secondary" className="shrink-0">
            Skipped
          </Badge>
        )}
      </button>
    );
  };

  return (
    <Collection
      items={items}
      keyExtractor={keyExtractor}
      textValueExtractor={textValueExtractor}
      layout={layout}
      renderItem={renderItem}
      selectionMode="single"
      defaultSelectedKeys={currentId !== undefined ? [currentId] : []}
      onSelectionChange={handleSelectionChange}
      filterKeys={['label', 'position']}
      filterDebounceMs={0}
      onFilterChange={(query) => {
        if (!query) {
          setMatchingKeys(null);
        }
      }}
      onFilterResultsChange={(keys) => setMatchingKeys(keys)}
      aria-label="Stages"
      className="min-h-0 flex-1"
      viewportClassName="py-4"
      emptyState={
        <Paragraph margin="none" className="text-text/70 p-8 text-sm">
          Nothing matched your search term.
        </Paragraph>
      }
    >
      {(CollectionElements) => (
        <div className="flex h-full flex-col">
          {CollectionElements}
          <div className="border-text/10 shrink-0 border-t p-4">
            <CollectionFilterInput
              placeholder="Filter..."
              size="sm"
              showResultCount={false}
            />
          </div>
        </div>
      )}
    </Collection>
  );
}
