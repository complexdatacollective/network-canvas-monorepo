'use client';

import { motion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { useDragAndDrop } from '@codaco/fresco-ui/collection/dnd/useDragAndDrop';
import { InlineGridLayout } from '@codaco/fresco-ui/collection/layout/InlineGridLayout';
import type {
  CollectionProps,
  ItemProps,
  Key,
} from '@codaco/fresco-ui/collection/types';
import type { DragMetadata, DropCallback } from '@codaco/fresco-ui/dnd/types';
import { useSafeAnimate } from '@codaco/fresco-ui/hooks/useSafeAnimate';
import { cx } from '@codaco/fresco-ui/utils/cva';
import { entityPrimaryKeyProperty, type NcNode } from '@codaco/shared-consts';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { readNodeLabelSource } from '../interfaces/Anonymisation/nodeLabel';
import { useDecryptedOutcomes } from '../interfaces/Anonymisation/useDecryptionScope';
import { useNodeLabeller } from '../interfaces/Anonymisation/useNodeLabel';
import { makeGetCodebookVariablesForNodeType } from '../selectors/protocol';
import Node from './ConnectedNode';

// Props that NodeList always provides internally — consumers can't override these
type InternalCollectionProps =
  | 'keyExtractor'
  | 'textValueExtractor'
  | 'layout'
  | 'dragAndDropHooks'
  | 'items'
  | 'children'
  | 'renderItem';

type NodeListProps = Omit<CollectionProps<NcNode>, InternalCollectionProps> & {
  items?: NcNode[];
  itemType?: string;
  accepts?: string[];
  acceptsFilter?: (metadata: DragMetadata | undefined) => boolean;
  onDrop?: DropCallback;
  onItemClick?: (node: NcNode) => void;
  /**
   * False turns off drag and drop for the list entirely: its people cannot be
   * dragged out and nothing can be dropped in.
   */
  dragAndDrop?: boolean;
  /** A person shown as selected, such as the one a bin stage is placing. */
  selectedItemId?: string;
  nodeSize?: 'xxs' | 'xs' | 'sm' | 'md' | 'lg';
  announcedName: string; // For accessibility announcements related to drag and drop
  testId?: string;
  renderItem?: CollectionProps<NcNode>['renderItem'];
};

const EXIT_DURATION = 0.2;

// The default for a list given no items: one array for every render, so the
// items passed through while rendering stay equal to those shown.
const NO_ITEMS: NcNode[] = [];

const NodeList = memo(
  ({
    // NodeList-specific props
    itemType = 'NODE',
    accepts,
    acceptsFilter,
    onDrop,
    onItemClick,
    dragAndDrop = true,
    selectedItemId,
    nodeSize = 'md',
    testId,
    // Collection props with NodeList defaults
    items = NO_ITEMS,
    id,
    className,
    animate = true,
    animationKey,
    emptyState = null,
    announcedName,
    'aria-label': ariaLabel,
    'renderItem': renderItemOverride,
    // All other Collection props passed through
    ...collectionProps
  }: NodeListProps) => {
    const intl = useAppIntl();
    const layout = useMemo(() => new InlineGridLayout<NcNode>({ gap: 4 }), []);
    // Safe animate so the exit fade skips (instant swap) under reduced
    // motion / MotionConfig skipAnimations; the scope doubles as the
    // container ref for querying stagger items.
    const [containerRef, safeAnimate] = useSafeAnimate();

    // --- Item buffering for prompt transitions ---
    // While the list fades its people out for a new animationKey (a prompt
    // change) it keeps showing the items it had; otherwise it shows `items`.
    const [displayItems, setDisplayItems] = useState(items);
    const [displayAnimationKey, setDisplayAnimationKey] =
      useState(animationKey);
    const [seenAnimationKey, setSeenAnimationKey] = useState(animationKey);
    // The exit under way: a new object for each animationKey change, so a
    // change made while one exit runs starts the exit again.
    const [pendingExit, setPendingExit] = useState<{
      key: typeof animationKey;
    } | null>(null);

    // Detect an animationKey change synchronously during render, so the list
    // is already transitioning when it commits and never flashes the new
    // items in. A list that mounted without a key never transitions.
    let exit = pendingExit;
    if (seenAnimationKey !== undefined && animationKey !== seenAnimationKey) {
      exit = { key: animationKey };
      setSeenAnimationKey(animationKey);
      setPendingExit(exit);
    }

    // When not transitioning, pass items through immediately
    if (exit === null && displayItems !== items) {
      setDisplayItems(items);
    }

    // Run the exit animation for an animationKey change, then show the new
    // key with the latest items (passed through once the exit is cleared).
    useEffect(() => {
      if (pendingExit === null) {
        return undefined;
      }
      let cancelled = false;
      const finish = () => {
        if (cancelled) return;
        setDisplayAnimationKey(pendingExit.key);
        setPendingExit(null);
      };

      const staggerItems = containerRef.current?.querySelectorAll<HTMLElement>(
        '[data-stagger-item]',
      );

      if (!staggerItems || staggerItems.length === 0) {
        finish();
        return undefined;
      }

      void safeAnimate(
        staggerItems,
        { opacity: 0, scale: 0.6 },
        { duration: EXIT_DURATION },
      ).then(finish);

      return () => {
        cancelled = true;
      };
    }, [pendingExit, containerRef, safeAnimate]);

    const keyExtractor = useCallback(
      (node: NcNode) => node[entityPrimaryKeyProperty],
      [],
    );

    const getCodebookVariablesForNodeType = useSelector(
      makeGetCodebookVariablesForNodeType,
    );

    // Typeahead matches the label each node shows, read by the same function:
    // the plaintext of an encrypted name once it is decrypted, and only the
    // locked or unavailable label otherwise, so typing never finds a node by
    // an answer it hides.
    const labelSources = useMemo(
      () =>
        new Map(
          displayItems.map((node) => [
            node,
            readNodeLabelSource(
              node,
              getCodebookVariablesForNodeType(node.type),
            ),
          ]),
        ),
      [displayItems, getCodebookVariablesForNodeType],
    );
    const encryptedLabels = useMemo(
      () =>
        [...labelSources.values()].flatMap((source) =>
          source.status === 'encrypted' ? [source.value] : [],
        ),
      [labelSources],
    );
    const labelNode = useNodeLabeller(useDecryptedOutcomes(encryptedLabels));

    // The collection reads each node's typeahead text only when its items
    // change, so they are handed over anew whenever a label changes: as each
    // name decrypts, and when the key stops being in force.
    const typeahead = useMemo(() => {
      const texts = new Map(
        displayItems.map((node) => [
          node[entityPrimaryKeyProperty],
          labelNode(node, labelSources.get(node)),
        ]),
      );
      return {
        items: [...displayItems],
        textOf: (node: NcNode) =>
          texts.get(node[entityPrimaryKeyProperty]) ?? labelNode(node),
        // A drag names the person by the label their card shows.
        ofKey: (key: Key) => texts.get(String(key)),
      };
    }, [displayItems, labelSources, labelNode]);

    // Build drag and drop hooks if accepts or onDrop is provided
    const { dragAndDropHooks } = useDragAndDrop<NcNode>({
      announcedName,
      getItems: (keys) => [{ type: itemType, keys }],
      acceptTypes: accepts,
      acceptsFilter,
      onDrop: onDrop
        ? (e) => {
            // Map Collection's DropEvent to the old metadata format
            onDrop(e.metadata);
          }
        : undefined,
      getItemMetadata: (key) => {
        const node = items.find(
          (n) => n[entityPrimaryKeyProperty] === String(key),
        );
        return node ? { ...node, itemType } : { itemType };
      },
      getItemAnnouncedName: typeahead.ofKey,
    });

    // Styling classes including drop state styling via data attributes
    const containerClasses = cx(
      '',
      'size-full grow before:rounded',
      'transition-colors duration-300',
      // data-drop-target-valid corresponds to willAccept
      'data-[drop-target-valid=true]:bg-drag-valid',
      // data-drop-target-over corresponds to isOver
      'data-[drop-target-over=true]:data-[drop-target-valid=true]:bg-drag-over',
      className,
    );

    const defaultRenderItem = useCallback(
      (node: NcNode, itemProps: ItemProps) => {
        const selected =
          selectedItemId !== undefined &&
          node[entityPrimaryKeyProperty] === selectedItemId;
        return (
          <Node
            {...itemProps}
            // The list does no selecting of its own, so it says which item the
            // host has picked out: an option cannot announce `aria-pressed`.
            aria-selected={
              selectedItemId === undefined
                ? itemProps['aria-selected']
                : selected
            }
            nodeId={node[entityPrimaryKeyProperty]}
            type={node.type}
            size={nodeSize}
            selected={selected}
            // Wrapping an absent handler would still hand the node a function,
            // which it reads as "this can be tapped" and answers with a pointer
            // cursor and press feedback. A list whose nodes are only draggable
            // must offer no click at all.
            onClick={onItemClick ? () => onItemClick(node) : undefined}
          />
        );
      },
      [nodeSize, onItemClick, selectedItemId],
    );

    const [animationComplete, setAnimationComplete] = useState(false);

    return (
      <motion.div
        ref={containerRef}
        variants={{
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
        }}
        onAnimationComplete={() => setAnimationComplete(true)}
        className="size-full grow"
        data-testid={testId}
      >
        {animationComplete && (
          <Collection
            {...collectionProps}
            key={displayAnimationKey}
            id={id ?? 'node-list'}
            items={typeahead.items}
            keyExtractor={keyExtractor}
            textValueExtractor={typeahead.textOf}
            layout={layout}
            renderItem={renderItemOverride ?? defaultRenderItem}
            dragAndDropHooks={dragAndDrop ? dragAndDropHooks : undefined}
            className={containerClasses}
            animate={animate}
            animationKey={displayAnimationKey}
            aria-label={ariaLabel ?? intl.formatMessage(messages.nodeList)}
            emptyState={emptyState}
            viewportClassName="p-4"
          >
            {(CollectionElements) => CollectionElements}
          </Collection>
        )}
      </motion.div>
    );
  },
);

NodeList.displayName = 'NodeList';

export default NodeList;
