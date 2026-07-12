import { get } from 'es-toolkit/compat';
import { Info, Plus, Search, TriangleAlert } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useSelector } from 'react-redux';

import { Collection } from '@codaco/fresco-ui/collection/components/Collection';
import { ListLayout } from '@codaco/fresco-ui/collection/layout/ListLayout';
import type { ItemProps, Key } from '@codaco/fresco-ui/collection/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import Modal from '@codaco/fresco-ui/Modal';
import ModalPopup from '@codaco/fresco-ui/Modal/ModalPopup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { VariableType } from '@codaco/protocol-validation';
import { SimpleVariablePill } from '~/components/VariablePill';
import type { RootState } from '~/ducks/store';
import { cx } from '~/utils/cva';
import { validations } from '~/utils/validations';

import { getVariablesForSubject } from '../../../../selectors/codebook';
import { sortByLabel } from '../../../Codebook/helpers';
import ExternalLink from '../../../ExternalLink';

const EMPTY_CLASSES =
  'flex grow basis-full items-start rounded px-7 py-5 text-current/80 [&_svg]:mr-3 [&_svg]:mt-1 [&_svg]:shrink-0';

const CREATE_NEW_CLASSES =
  'flex items-center justify-center px-5 py-1 font-medium text-current [&_svg]:mr-5 [&_svg]:h-5';

const RESULTS_ID = 'variable-spotlight-results';

type VariableOption = {
  value: string;
  label: string;
  type?: string;
};

type VariableSpotlightItem =
  | {
      id: string;
      kind: 'create';
      label: string;
      value: string;
    }
  | {
      id: string;
      kind: 'invalid';
      label: string;
      reason: string;
    }
  | {
      id: string;
      kind: 'variable';
      label: string;
      value: string;
      variableType: VariableType;
    };

type VariableSpotlightProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disallowCreation?: boolean;
  onSelect: (value: string) => void;
  entity?: string;
  type?: string;
  onCancel: () => void;
  onCreateOption: (value: string) => void;
  options: VariableOption[];
};

const renderEmptyMessage = (icon: ReactNode, children: ReactNode) => (
  <div data-testid="variable-spotlight-empty" className={EMPTY_CLASSES}>
    {icon}
    <div>{children}</div>
  </div>
);

const VariableSpotlight = ({
  open,
  onOpenChange,
  entity,
  type,
  onSelect,
  onCancel,
  onCreateOption,
  options,
  disallowCreation = false,
}: VariableSpotlightProps) => {
  const [filterTerm, setFilterTerm] = useState('');

  const resetState = useCallback(() => {
    setFilterTerm('');
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onCancel();
  }, [onCancel, resetState]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetState();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, resetState],
  );

  const handleCreateOption = useCallback(
    (value: string) => {
      setFilterTerm('');
      onCreateOption(value);
    },
    [onCreateOption],
  );

  const sortedAndFilteredItems = useMemo(() => {
    const sortedOptions = [...options].toSorted(sortByLabel);
    if (!filterTerm) {
      return sortedOptions;
    }
    return sortedOptions.filter((item) =>
      item.label.toLowerCase().includes(filterTerm.toLowerCase()),
    );
  }, [filterTerm, options]);

  // Memoize subject to avoid creating new object on every render, which breaks selector memoization
  const subject = useMemo(
    () => ({
      entity: ((entity || '') as 'node' | 'edge' | 'ego') || 'node',
      type: type || undefined,
    }),
    [entity, type],
  );

  const existingVariables = useSelector((state: RootState) =>
    getVariablesForSubject(state, subject),
  );

  const hasOptions = options.length > 0;
  const hasFilterTerm = filterTerm.length > 0;
  const hasFilterResults = sortedAndFilteredItems.length > 0;
  const hasExactFilterMatch = options.some((item) => item.label === filterTerm);

  const existingVariableNames = useMemo(
    () =>
      Object.keys(existingVariables)
        .map((variable) => get(existingVariables[variable], 'name'))
        .filter((value): value is string => typeof value === 'string'),
    [existingVariables],
  );

  const invalidVariableName = useMemo(() => {
    const unique = validations.uniqueByList(existingVariableNames)(filterTerm);
    const allowed = validations.allowedVariableName()(filterTerm);
    return unique || allowed || undefined;
  }, [filterTerm, existingVariableNames]);

  const collectionItems = useMemo<VariableSpotlightItem[]>(() => {
    const items: VariableSpotlightItem[] = [];
    const canShowCreation = hasFilterTerm && !hasExactFilterMatch;

    if (canShowCreation && !disallowCreation) {
      if (invalidVariableName) {
        items.push({
          id: `invalid:${filterTerm}`,
          kind: 'invalid',
          label: `Cannot create variable named "${filterTerm}"`,
          reason: invalidVariableName,
        });
      } else {
        items.push({
          id: `create:${filterTerm}`,
          kind: 'create',
          label: `Create new variable called "${filterTerm}".`,
          value: filterTerm,
        });
      }
    }

    items.push(
      ...sortedAndFilteredItems.map(({ value, label, type: optionType }) => ({
        id: value,
        kind: 'variable' as const,
        label,
        value,
        variableType: ((optionType as VariableType) || 'text') as VariableType,
      })),
    );

    return items;
  }, [
    disallowCreation,
    filterTerm,
    hasExactFilterMatch,
    hasFilterTerm,
    invalidVariableName,
    sortedAndFilteredItems,
  ]);

  const disabledKeys = useMemo(
    () =>
      collectionItems
        .filter((item) => item.kind === 'invalid')
        .map((item) => item.id),
    [collectionItems],
  );

  const layout = useMemo(
    () => new ListLayout<VariableSpotlightItem>({ gap: 1 }),
    [],
  );

  const handleSelectItem = useCallback(
    (item: VariableSpotlightItem) => {
      if (item.kind === 'create') {
        handleCreateOption(item.value);
        return;
      }
      if (item.kind === 'variable') {
        onSelect(item.value);
      }
    },
    [handleCreateOption, onSelect],
  );

  const handleSelectionChange = useCallback(
    (keys: Set<Key>) => {
      const [selectedKey] = [...keys];
      const selectedItem = collectionItems.find(
        (item) => item.id === selectedKey,
      );

      if (!selectedItem || selectedItem.kind === 'invalid') return;
      handleSelectItem(selectedItem);
    },
    [collectionItems, handleSelectItem],
  );

  const handleFilter = useCallback((value: string | undefined) => {
    setFilterTerm(value ?? '');
  }, []);

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        handleClose();
        return;
      }

      if (
        (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
        collectionItems.length > 0
      ) {
        event.preventDefault();
        window.requestAnimationFrame(() => {
          document.getElementById(RESULTS_ID)?.focus();
        });
        return;
      }

      if (event.key !== 'Enter') return;

      if (
        hasFilterTerm &&
        !disallowCreation &&
        !hasExactFilterMatch &&
        !invalidVariableName
      ) {
        event.preventDefault();
        handleCreateOption(filterTerm);
        return;
      }

      if (hasFilterTerm && sortedAndFilteredItems.length === 1) {
        event.preventDefault();
        const [result] = sortedAndFilteredItems;
        if (result) onSelect(result.value);
      }
    },
    [
      collectionItems.length,
      disallowCreation,
      filterTerm,
      handleClose,
      handleCreateOption,
      hasExactFilterMatch,
      hasFilterTerm,
      invalidVariableName,
      onSelect,
      sortedAndFilteredItems,
    ],
  );

  const renderItem = useCallback(
    (item: VariableSpotlightItem, itemProps: ItemProps) => (
      <div
        {...itemProps}
        data-testid="spotlight-list-item"
        className={cx(
          'focusable flex w-full items-center justify-between rounded px-4 py-2.5 transition-colors',
          'data-focused:bg-surface-2 data-selected:bg-primary data-selected:text-primary-contrast',
          'data-disabled:cursor-not-allowed data-disabled:opacity-60',
        )}
      >
        {item.kind === 'variable' && (
          <SimpleVariablePill label={item.label} type={item.variableType}>
            <span />
          </SimpleVariablePill>
        )}
        {item.kind === 'create' && (
          <div className={CREATE_NEW_CLASSES}>
            <Plus aria-hidden />
            <span>{item.label}</span>
          </div>
        )}
        {item.kind === 'invalid' && (
          <div className={CREATE_NEW_CLASSES}>
            <TriangleAlert aria-hidden />
            <span>
              {item.label}: {item.reason}.
            </span>
          </div>
        )}
      </div>
    ),
    [],
  );

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <div
        aria-hidden
        className="bg-overlay publish-colors pointer-events-none fixed inset-0 z-1900 backdrop-blur-xs"
      />
      <ModalPopup
        key="variable-spotlight-popup"
        className="fixed top-10 left-1/2 z-2000 w-xl max-w-[calc(100vw-3rem)] -translate-x-1/2 bg-transparent shadow-none outline-none"
      >
        <MotionSurface
          floating
          noContainer
          spacing="none"
          shadow="none"
          className="effect-shadow-xl flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden"
        >
          <header className="shrink-0 grow-0 basis-14 px-7 py-5">
            <InputField
              autoFocus
              type="search"
              placeholder={
                disallowCreation
                  ? 'Find a variable...'
                  : 'Create or find a variable...'
              }
              value={filterTerm}
              onChange={handleFilter}
              onKeyDown={handleInputKeyDown}
              prefixComponent={<Search aria-hidden className="size-4" />}
              className="w-full"
              aria-label="Find or create a variable"
            />
          </header>
          <main className="min-h-0 flex-auto pb-1">
            {!disallowCreation && !hasOptions && (
              <>
                {renderEmptyMessage(
                  <Info aria-hidden />,
                  <Paragraph margin="none">
                    To create your first variable of this type, type a name
                    above and press enter. See our&nbsp;
                    <ExternalLink href="https://documentation.networkcanvas.com/reference/variable-naming/">
                      documentation on variable naming
                    </ExternalLink>
                    &nbsp;for more information.
                  </Paragraph>,
                )}
              </>
            )}
            {disallowCreation &&
              !hasFilterTerm &&
              !hasOptions &&
              renderEmptyMessage(
                <TriangleAlert aria-hidden />,
                <Paragraph margin="none">
                  No variables exist for you to select, and you cannot create a
                  new variable from here. Please create one or more variables
                  elsewhere in your protocol, and return here to select them.
                </Paragraph>,
              )}
            {disallowCreation &&
              hasFilterTerm &&
              !hasFilterResults &&
              renderEmptyMessage(
                <TriangleAlert aria-hidden />,
                <Paragraph margin="none">
                  You cannot create a new variable from here. Please create one
                  or more variables elsewhere in your protocol, and return here
                  to select them.
                </Paragraph>,
              )}
            {collectionItems.length > 0 && (
              <Collection
                id={RESULTS_ID}
                aria-label="Variable results"
                items={collectionItems}
                keyExtractor={(item) => item.id}
                textValueExtractor={(item) => item.label}
                layout={layout}
                renderItem={renderItem}
                selectionMode="single"
                selectedKeys={[]}
                onSelectionChange={handleSelectionChange}
                disabledKeys={disabledKeys}
                className="h-[min(60vh,28rem)]"
                viewportClassName="scroll-smooth px-3 pb-3"
                fade
              >
                {(CollectionElements) => CollectionElements}
              </Collection>
            )}
          </main>
        </MotionSurface>
      </ModalPopup>
    </Modal>
  );
};

export default VariableSpotlight;
