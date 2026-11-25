'use client';

import { AnimatePresence } from 'motion/react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl, AppMessage } from '@codaco/app-i18n/react';
import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { CollectionFilterInput } from '@codaco/fresco-ui/collection/components/CollectionFilterInput';
import { CollectionSortButton } from '@codaco/fresco-ui/collection/components/CollectionSortButton';
import { useDragAndDrop } from '@codaco/fresco-ui/collection/dnd/useDragAndDrop';
import { GridLayout } from '@codaco/fresco-ui/collection/layout/GridLayout';
import type {
  SortableProperty,
  SortRule,
} from '@codaco/fresco-ui/collection/sorting/types';
import type { ItemProps } from '@codaco/fresco-ui/collection/types';
import { type DndStore, useDndStore } from '@codaco/fresco-ui/dnd/dnd';
import Icon from '@codaco/fresco-ui/Icon';
import Node from '@codaco/fresco-ui/Node';
import { ResizableFlexPanel } from '@codaco/fresco-ui/ResizableFlexPanel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { resolveNodeShapeReference } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { useTrack } from '../../analytics/useTrack';
import Loading from '../../components/Loading';
import NodeList from '../../components/NodeList';
import Panel from '../../components/Panel';
import Prompts from '../../components/Prompts';
import { usePrompts } from '../../components/Prompts/usePrompts';
import { useCurrentStep } from '../../contexts/CurrentStepContext';
import { DynamicTextParts } from '../../dynamicValues/DynamicText';
import {
  writeFailureMessage,
  writeSucceeded,
} from '../../forms/writeSubmissionResult';
import { useCustomShapeSvgs } from '../../hooks/useCustomShapeSvgs';
import useNodeLimits from '../../hooks/useNodeLimits';
import { useStageSelector } from '../../hooks/useStageSelector';
import { useStageSubjectName } from '../../hooks/useStageSubjectName';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import {
  useLocalizedString,
  useContentLocale,
  useResolveLocalizedMessage,
  useResolveLocalizedString,
} from '../../localization/ProtocolLocalizationProvider';
import { useStageWording } from '../../localization/useStageWording';
import { getNodeVariables } from '../../selectors/interface';
import {
  getSearchOptions,
  getSortOptions,
} from '../../selectors/name-generator';
import { getCodebookVariablesForSubjectType } from '../../selectors/protocol';
import {
  getNetworkNodesForPrompt,
  getNodeColorSelector,
  getNodeTypeDefinition,
  getPromptAdditionalAttributes,
  getStageNodeCount,
  resolveNodeShape,
} from '../../selectors/session';
import type { DropSound } from '../../sounds/InteractionSounds';
import { addNode, deleteNode } from '../../store/modules/session';
import { useAppDispatch } from '../../store/store';
import { useInterviewToast } from '../../toast/useInterviewToast';
import getParentKeyByNameValue from '../../utils/getParentKeyByNameValue';
import { usePassphrase } from '../Anonymisation/usePassphrase';
import { interfaceMessages } from '../messages';
import { promptListDropSound } from '../promptListDrop';
import { buildRosterSortConfig } from './buildRosterSortConfig';
import DataCard from './DataCard';
import DropOverlay from './DropOverlay';
import { convertNamesToUUIDs, type NameGeneratorRosterProps } from './helpers';
import useItems, { type UseItemElement } from './useItems';

const ErrorMessage = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2">
    <Icon name="warning" aria-hidden />
    <Heading level="h2" className="sr-only" lang="en">
      {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx -- screen-reader text stays English */}
      {'Something went wrong'}
    </Heading>
    <Paragraph>
      <AppMessage message={interfaceMessages.externalDataError} />
    </Paragraph>
  </div>
);

// Desired minimum width of a roster DataCard (the grid column floor).
const CARD_MIN_WIDTH = 400;
// Minimum width of the source panel: the card width plus the ScrollArea
// viewport padding (px-2 = 16px) and a scrollbar allowance, so the resize
// handle can never drag the panel narrow enough for a card to overflow.
const SOURCE_PANEL_MIN_WIDTH = CARD_MIN_WIDTH + 32;

const itemLabel = (item: UseItemElement) => item.props.label;

const layout = new GridLayout<UseItemElement>({
  gap: 2,
  minItemWidth: CARD_MIN_WIDTH,
});

const keyExtractor = (item: UseItemElement) => item.id;

/**
 * Name Generator (unified) Roster Interface
 */
const NameGeneratorRoster = (props: NameGeneratorRosterProps) => {
  const intl = useAppIntl();
  const { stage } = props;
  // The stage's own words, and Network Canvas's where the stage holds none.
  const wording = useStageWording(stage);
  const { text: panelTitleText, parts: panelTitleParts } = useLocalizedString(
    wording.text('panelTitle'),
  );
  const panelTitle =
    panelTitleParts === undefined ? (
      panelTitleText
    ) : (
      <DynamicTextParts parts={panelTitleParts} />
    );
  const subject = useStageSubjectName();
  const resolveMessage = useResolveLocalizedMessage();
  const allAddedNotice = resolveMessage(wording.text('allAddedNotice'), {
    subject,
  }).text;
  // The protocol's interface text words the search (`search.searchLabel`).
  const searchLabel = intl.formatMessage(commonMessages.search);
  const loadingStatus = 'Loading…';

  const { isLastPrompt } = usePrompts();

  const { requirePassphrase, unlocked } = usePassphrase();
  const { showToast } = useInterviewToast();

  const interfaceRef = useRef(null);

  const dispatch = useAppDispatch();
  const { currentStep } = useCurrentStep();

  const newNodeAttributes = useStageSelector(getPromptAdditionalAttributes);
  const codebookForNodeType = useStageSelector(
    getCodebookVariablesForSubjectType,
  );
  const nodesForPrompt = useStageSelector(getNetworkNodesForPrompt);

  const dropNodeColor = useStageSelector(getNodeColorSelector);
  const nodeTypeDefinition = useStageSelector(getNodeTypeDefinition);
  const shapeSvgs = useCustomShapeSvgs();

  const { status: itemsStatus, items, excludeItems } = useItems(props);

  const track = useTrack();
  const rosterLoadedRef = useRef(false);
  useEffect(() => {
    if (itemsStatus.state === 'ready' && !rosterLoadedRef.current) {
      track('roster_loaded', { entry_count: items.length });
      rosterLoadedRef.current = true;
    }
  }, [itemsStatus.state, items, track]);

  const lastFilterStateRef = useRef<boolean>(false);
  const handleFilterChange = useCallback(
    (query: string) => {
      const hasFilter = query.trim().length > 0;
      if (hasFilter !== lastFilterStateRef.current) {
        track('roster_filter_changed', { has_filter: hasFilter });
        lastFilterStateRef.current = hasFilter;
      }
    },
    [track],
  );

  const stageNodeCount = useStageSelector(getStageNodeCount);
  const minNodes = stage.behaviours?.minNodes ?? 0;
  const maxNodes = stage.behaviours?.maxNodes ?? Number.POSITIVE_INFINITY;

  // --- Search / filter setup ---
  const searchOptions = useStageSelector(getSearchOptions);
  const nodeVariables = useStageSelector(getNodeVariables);

  const filterKeys = useMemo(() => {
    if (!searchOptions) return undefined;
    return convertNamesToUUIDs(
      nodeVariables,
      searchOptions.matchProperties,
    ).map((uuid) => ['data', entityAttributesProperty, uuid]);
  }, [searchOptions, nodeVariables]);

  const filterFuseOptions = useMemo(() => {
    if (!searchOptions) return undefined;
    return {
      threshold: searchOptions.fuzziness,
      ignoreLocation: true,
      minMatchCharLength: 1,
      findAllMatches: true,
      useExtendedSearch: true,
    };
  }, [searchOptions]);

  // --- Sort setup ---
  const sortOptions = useStageSelector(getSortOptions);
  const resolve = useResolveLocalizedString();
  const contentLocale = useContentLocale();

  // Sort buttons take plain text, so their labels are resolved here.
  const { initialSortRules, sortableProperties } = useMemo<{
    initialSortRules: SortRule[] | undefined;
    sortableProperties: SortableProperty[] | undefined;
  }>(
    () =>
      buildRosterSortConfig(
        sortOptions && {
          sortOrder: sortOptions.sortOrder,
          sortableProperties: sortOptions.sortableProperties?.map(
            ({ label, variable }) => ({ label: resolve(label).text, variable }),
          ),
        },
        nodeVariables,
      ),
    [sortOptions, nodeVariables, resolve],
  );

  // --- Encryption detection ---
  const useEncryption = useMemo(() => {
    if (
      Object.keys(newNodeAttributes).some(
        (variableId) => codebookForNodeType[variableId]?.encrypted,
      )
    ) {
      return true;
    }

    const itemAttributesWithCodebookMatches = items.reduce(
      (codebookMatches, item) => {
        const attributesWithCodebookMatches = Object.keys(
          item.data[entityAttributesProperty],
        ).reduce((acc, attribute) => {
          const codebookKey = getParentKeyByNameValue(
            codebookForNodeType,
            attribute,
          );

          if (codebookKey) {
            return [...acc, codebookKey];
          }

          return acc;
        }, [] as string[]);

        return [
          ...codebookMatches,
          ...attributesWithCodebookMatches.filter(
            (codebookMatch) => !codebookMatches.includes(codebookMatch),
          ),
        ];
      },
      [] as string[],
    );

    return itemAttributesWithCodebookMatches.some(
      (itemAttribute) => codebookForNodeType[itemAttribute]?.encrypted,
    );
  }, [items, codebookForNodeType, newNodeAttributes]);

  useEffect(() => {
    if (useEncryption) {
      requirePassphrase();
    }
  }, [useEncryption, requirePassphrase]);

  // Answers this stage would encrypt can only be taken once the interview's
  // passphrase has been entered.
  const encryptionLocked = useEncryption && !unlocked;

  const { maxNodesReached } = useNodeLimits({
    stageNodeCount,
    minNodes,
    maxNodes,
    minNodesNotice: wording.shown('minNodesNotice'),
    maxNodesNotice: wording.shown('maxNodesNotice'),
    isLastPrompt,
  });

  // The people whose add is under way. Protecting their answers can take a
  // while, so they leave the roster as soon as they are dropped rather than
  // once they are in the network, and a second drop of the same card is
  // ignored. The ref answers a drop straight away; the state re-renders.
  const addingRef = useRef(new Set<string>());
  const [adding, setAdding] = useState<ReadonlySet<string>>(() => new Set());

  // Resolves whether the person was added: a drop that needs the passphrase
  // first, repeats an add under way, or whose write is refused adds nobody.
  const handleAddNode = async (metadata?: Record<string, unknown>) => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drag metadata is the dragged roster item, set by this component's drag source (fresco-ui types it as a record)
    const meta = metadata as UseItemElement | undefined;
    if (!meta) return false;

    if (encryptionLocked) {
      requirePassphrase();
      return false;
    }

    const { id, data } = meta;
    if (addingRef.current.has(id)) return false;
    addingRef.current.add(id);
    setAdding(new Set(addingRef.current));

    const attributeData = {
      ...newNodeAttributes,
      ...data[entityAttributesProperty],
    };

    const result = await dispatch(
      addNode({
        type: stage.subject.type,
        modelData: {
          [entityPrimaryKeyProperty]: id,
        },
        attributeData,
        useEncryption,
        allowUnknownAttributes: true,
        currentStep,
      }),
    ).finally(() => {
      addingRef.current.delete(id);
      setAdding(new Set(addingRef.current));
    });
    const failure = writeFailureMessage(result);
    if (failure) {
      showToast({
        description: intl.formatMessage(failure),
        variant: 'destructive',
        anchor: 'forward',
      });
    }
    return writeSucceeded(result);
  };

  // Says whether the person was taken off the question.
  const handleRemoveNode = useCallback(
    (metadata: Record<string, unknown>) => {
      const uid = metadata[entityPrimaryKeyProperty];
      if (typeof uid !== 'string' || !uid) return false;
      dispatch(deleteNode(uid));
      return true;
    },
    [dispatch],
  );

  const disabled = useMemo(() => {
    if (encryptionLocked) {
      return true;
    }
    // Nothing may be dragged out of a roster that has not finished arriving —
    // including before the read starts (`idle`).
    if (itemsStatus.state === 'idle' || itemsStatus.state === 'loading') {
      return true;
    }

    if (maxNodesReached) {
      return true;
    }

    return false;
  }, [maxNodesReached, itemsStatus, encryptionLocked]);

  // --- Exclude added items, and those being added, from source panel ---
  const filteredItems = useMemo(() => {
    if (excludeItems.length === 0 && adding.size === 0) return items;
    const excludeSet = new Set([...excludeItems, ...adding]);
    return items.filter((item) => !excludeSet.has(item.id));
  }, [items, excludeItems, adding]);

  // --- Disabled keys to prevent dragging when disabled ---
  const disabledKeys = useMemo(
    () => (disabled ? filteredItems.map((item) => item.id) : undefined),
    [disabled, filteredItems],
  );

  // `Collection` renders one `emptyState` whenever it holds nothing, and it
  // cannot know WHY: it is handed `filteredItems`, which is already the roster
  // minus everything in the network. So the three reasons are told apart here,
  // where they are still distinguishable, rather than reporting a search miss
  // for all of them (#1400) — including on stages that have no search at all,
  // where `searchOptions` is absent, `CollectionFilterInput` never renders and
  // a search miss is unreachable.
  const emptyState = useMemo(() => {
    // Reachable only once the roster has actually arrived: the panel below
    // renders the collection at all only in the `ready` state, so an empty
    // `items` here means the list really is empty rather than not yet read.
    if (items.length === 0 || filteredItems.length === 0) {
      return <>{allAddedNotice}</>;
    }
    return <AppMessage message={runtimeMessages.noSearchMatch} />;
  }, [items.length, filteredItems.length, allAddedNotice]);

  // --- DnD setup for source panel ---
  const sourceCollectionId = `source-nodes-${useId()}`;

  const { dragAndDropHooks } = useDragAndDrop<UseItemElement>({
    announcedName: 'Available Roster Nodes',
    getItems: (keys) => [{ type: 'SOURCE_NODES', keys }],
    acceptTypes: ['ADDED_NODES'],
    // A person dropped back on the roster is taken off the question.
    dropFeedback: 'toggle-off' satisfies DropSound,
    onDrop: (e) => handleRemoveNode(e.metadata),
    getItemMetadata: (key) => {
      const item = filteredItems.find((i) => i.id === String(key));
      return item
        ? { ...item, itemType: 'SOURCE_NODES' }
        : { itemType: 'SOURCE_NODES' };
    },
    // A drag names the person by the label their card shows.
    getItemAnnouncedName: (key) =>
      filteredItems.find((i) => i.id === String(key))?.props.label,
    renderPreview: (_key, metadata) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drag metadata is the dragged roster item, set by this component's drag source (fresco-ui types it as a record)
      const item = metadata as UseItemElement | undefined;
      if (!item?.props?.label) return null;
      return (
        <Node
          color={dropNodeColor ?? 'node-color-seq-1'}
          shape={
            nodeTypeDefinition && item.data
              ? resolveNodeShape(
                  nodeTypeDefinition,
                  item.data[entityAttributesProperty],
                  shapeSvgs,
                )
              : undefined
          }
          label={item.props.label}
          size="md"
        />
      );
    },
  });

  // --- Drop overlay state ---
  // Selecting a derived boolean (rather than raw dragItem/isDragging) keeps
  // this parent from re-rendering on every drag-position update — it only
  // re-renders when acceptance actually toggles.
  const willAcceptDrop = useDndStore(
    (state: DndStore) =>
      state.isDragging && state.dragItem?.metadata?.itemType === 'ADDED_NODES',
  );
  const sourceDropTargetId = `${sourceCollectionId}-container`;

  const renderItem = useCallback(
    (item: UseItemElement, itemProps: ItemProps) => (
      <DataCard
        {...itemProps}
        label={item.props.label}
        details={item.props.data}
      />
    ),
    [],
  );

  return (
    <div className="interface" ref={interfaceRef}>
      <Prompts />
      <ResizableFlexPanel
        storageKey="name-generator-roster-panels"
        defaultBasis={50}
        minSizePx={SOURCE_PANEL_MIN_WIDTH}
        className="min-h-0 w-full flex-1 basis-full"
        aria-label="Resize panel and node list areas"
      >
        <Panel title={panelTitle} panelNumber={0} noCollapse>
          {/*
            `idle` is the state of the first frame, before the effect that
            reads the roster has run. Treating it as loading is what keeps the
            empty state below from telling the participant there is nothing to
            add before anything has been looked for.
          */}
          {itemsStatus.state === 'idle' || itemsStatus.state === 'loading' ? (
            <div className="flex flex-1 items-center justify-center">
              <Loading message={intl.formatMessage(commonMessages.loading)} />
            </div>
          ) : itemsStatus.state === 'error' ? (
            <ErrorMessage />
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col [&_.card]:cursor-grab">
              <Collection
                items={filteredItems}
                keyExtractor={keyExtractor}
                textValueExtractor={itemLabel}
                viewportClassName="px-2"
                layout={layout}
                renderItem={renderItem}
                filterKeys={filterKeys}
                filterFuseOptions={filterFuseOptions}
                onFilterChange={handleFilterChange}
                sortRules={initialSortRules}
                sortLocale={contentLocale}
                dragAndDropHooks={dragAndDropHooks}
                disabledKeys={disabledKeys}
                virtualized
                emptyState={emptyState}
                aria-label="List of available items to add"
                id={sourceCollectionId}
              >
                {(CollectionElements) => (
                  <>
                    <div>
                      {searchOptions && (
                        <div className="flex flex-wrap gap-2 p-2">
                          <CollectionFilterInput
                            placeholder={searchLabel}
                            loadingText={loadingStatus}
                            indexingText={loadingStatus}
                          />
                        </div>
                      )}
                      {sortableProperties && sortableProperties.length > 0 && (
                        <div className="flex flex-wrap gap-2 p-2">
                          {sortableProperties.map((sp) => (
                            <CollectionSortButton
                              key={
                                Array.isArray(sp.property)
                                  ? sp.property.join('-')
                                  : sp.property
                              }
                              property={sp.property}
                              type={sp.type}
                              hierarchy={sp.hierarchy}
                              label={sp.label}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {CollectionElements}
                  </>
                )}
              </Collection>
              <AnimatePresence>
                {willAcceptDrop && (
                  <DropOverlay
                    dropTargetId={sourceDropTargetId}
                    nodeColor={dropNodeColor}
                    nodeShape={resolveNodeShapeReference(
                      nodeTypeDefinition?.shape.default,
                      nodeTypeDefinition?.customShapes,
                      shapeSvgs,
                    )}
                    message="Drop here to remove"
                  />
                )}
              </AnimatePresence>
            </div>
          )}
        </Panel>
        <NodeList
          id="node-list"
          className="flex flex-1 rounded"
          itemType="ADDED_NODES"
          accepts={['SOURCE_NODES']}
          onDrop={handleAddNode}
          dropSound={promptListDropSound}
          items={nodesForPrompt}
          announcedName="Added Nodes"
        />
      </ResizableFlexPanel>
    </div>
  );
};

export default NameGeneratorRoster;
