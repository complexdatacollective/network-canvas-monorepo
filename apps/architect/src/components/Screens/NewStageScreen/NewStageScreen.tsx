import { get } from 'es-toolkit/compat';
import Fuse from 'fuse.js';
import { Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { connect, useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import Button, { IconButton } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Tag from '~/components/Tag';
import type { RootState } from '~/ducks/modules/root';
import { getExperiments, getTimelineLocus } from '~/selectors/protocol';

import InterfaceList from './InterfaceList';
import {
  INTERFACE_TYPES,
  type InterfaceType,
  TAG_COLORS,
  TAGS,
} from './interfaceOptions';
type FuseResultWithScore<T> = {
  item: T;
  score?: number;
};

const fuseOptions = {
  threshold: 0.25,
  shouldSort: true,
  findAllMatches: true,
  includeScore: true,
  distance: 10000, // Needed because keywords are long strings
  keys: ['title', 'description', 'keywords'],
};

// Using existing getTimelineLocus selector instead of custom selector

const fuse = new Fuse(INTERFACE_TYPES, fuseOptions);

const interfaceHasAllSelectedTags = (
  selectedTags: string[],
  interfaceTags: string[],
) => {
  if (selectedTags.length === 0) {
    return true;
  }
  return selectedTags.every((tag: string) => interfaceTags.includes(tag));
};

const search = (query: string): InterfaceType[] => {
  if (query.length === 0) {
    return INTERFACE_TYPES;
  }
  const result: FuseResultWithScore<InterfaceType>[] = fuse.search(
    query,
  ) as FuseResultWithScore<InterfaceType>[];
  return result
    .toSorted((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .map((item) => item.item);
};

type NewStageScreenProps = {
  insertAtIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experiments?: {
    encryptedVariables?: boolean;
  };
};

const NewStageScreen = ({
  insertAtIndex,
  open,
  onOpenChange,
  experiments = {},
}: NewStageScreenProps) => {
  const [, setLocation] = useLocation();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [cursorActive, setCursorActive] = useState(false);
  const [mouseMoved, setMouseMoved] = useState(false);

  const _locus = useSelector(getTimelineLocus);

  const filteredInterfaces = useMemo(() => {
    let interfaces = search(query).filter(({ tags: interfaceTags }) =>
      // eslint-disable-next-line implicit-arrow-linebreak
      interfaceHasAllSelectedTags(selectedTags, interfaceTags),
    );

    if (!experiments.encryptedVariables) {
      interfaces = interfaces.filter(({ type }) => type !== 'Anonymisation');
    }

    return interfaces;
  }, [query, selectedTags, experiments]);

  const filteredInterfaceTags = useMemo(
    () =>
      filteredInterfaces.reduce<string[]>((acc, { tags }) => {
        acc.push(...tags);
        return acc;
      }, []),
    [filteredInterfaces],
  );

  const tags = useMemo(
    () =>
      Object.values(TAGS).map((value) => ({
        value,
        selected: selectedTags.includes(value),
        disabled: !filteredInterfaceTags.includes(value),
      })),
    [selectedTags, filteredInterfaceTags],
  );

  const handleTagClick = useCallback(
    (tag: string) => {
      if (selectedTags.includes(tag)) {
        setSelectedTags(selectedTags.filter((t) => t !== tag));
        return;
      }

      setSelectedTags([...selectedTags, tag]);
    },
    [selectedTags],
  );

  // Don't fire card enter/exit events until the mouse has moved
  const handleMouseMove = useCallback(() => {
    if (!mouseMoved) {
      setMouseMoved(true);
    }
  }, [mouseMoved]);

  const handleUpdateQuery = useCallback((value: string | undefined) => {
    setQuery(value ?? '');
  }, []);

  const handleSelectInterface = useCallback(
    (interfaceType: string) => {
      onOpenChange(false); // Close the dialog

      const params = new URLSearchParams();
      params.set('type', interfaceType);
      if (insertAtIndex !== undefined) {
        params.set('insertAtIndex', insertAtIndex.toString());
      }
      setLocation(`/protocol/stage/new?${params.toString()}`);
    },
    [insertAtIndex, onOpenChange, setLocation],
  );

  // Navigate within the list of results using the keyboard
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // Prevent moving cursor within search input
        if (!cursorActive) {
          setCursorActive(true);
          return;
        }

        setMouseMoved(false);
      }

      if (cursor > filteredInterfaces.length - 1) {
        setCursor(filteredInterfaces.length - 1);
        return;
      }

      if (e.key === 'Enter') {
        const selectedInterface = filteredInterfaces[cursor];
        if (selectedInterface) {
          handleSelectInterface(selectedInterface.type);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (cursor === 0) {
          return;
        }
        setCursor(cursor - 1);
      } else if (e.key === 'ArrowDown') {
        if (cursor + 1 > filteredInterfaces.length - 1) {
          return;
        }
        setCursor(cursor + 1);
      }
    },
    [cursor, cursorActive, filteredInterfaces, handleSelectInterface],
  );

  const handleRemoveHighlight = useCallback(() => {
    if (!mouseMoved) {
      return;
    }
    setCursorActive(false);
    setCursor(0);
  }, [mouseMoved]);

  const handleSetHighlight = useCallback(
    (index: number) => {
      if (!mouseMoved) {
        return;
      }
      setCursorActive(true);
      setCursor(index);
    },
    [mouseMoved],
  );

  const handleClearSearchAndFilter = useCallback(() => {
    setQuery('');
    setSelectedTags([]);
  }, []);

  const hasQuery = query !== '';

  // Once we get a search string, show the cursor at index 0
  useEffect(() => {
    if (!hasQuery) {
      return;
    }
    setCursor(0);
    setCursorActive(true);
    setMouseMoved(false);
  }, [hasQuery]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [handleMouseMove]);

  if (insertAtIndex === undefined) return null;

  return (
    <Dialog
      open={open}
      closeDialog={() => onOpenChange(false)}
      title="Select an Interface Type"
      size="fullscreen"
      header={
        <div className="flex flex-col gap-4">
          <div className="w-full">
            <InputField
              type="search"
              aria-label="Search interfaces"
              placeholder="Search interfaces by name or keyword..."
              value={query}
              onChange={handleUpdateQuery}
              onKeyDown={handleKeyDown}
              autoFocus
              prefixComponent={<Search aria-hidden />}
              suffixComponent={
                hasQuery ? (
                  <IconButton
                    aria-label="Clear search"
                    title="Clear search"
                    size="sm"
                    variant="text"
                    color="dynamic"
                    onClick={() => setQuery('')}
                    icon={<X aria-hidden />}
                  />
                ) : null
              }
            />
          </div>
          <div className="flex items-center gap-4">
            <Heading
              level="h4"
              margin="none"
              className="shrink-0 text-sm font-semibold"
            >
              Filter by capabilities:
            </Heading>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Interface capability filters"
            >
              {tags.map(({ value, selected, disabled }) => (
                <Tag
                  key={value}
                  id={value}
                  selected={selected}
                  onClick={handleTagClick}
                  color={get(TAG_COLORS, value)}
                  disabled={disabled}
                >
                  {value}
                </Tag>
              ))}
            </div>
          </div>
        </div>
      }
      footer={
        <Button color="default" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      }
    >
      <InterfaceList
        items={filteredInterfaces}
        onSelect={handleSelectInterface}
        highlightedIndex={cursorActive ? cursor : undefined}
        handleClearSearchAndFilter={handleClearSearchAndFilter}
        setHighlighted={handleSetHighlight}
        removeHighlighted={handleRemoveHighlight}
      />
    </Dialog>
  );
};

const mapStateToProps = (state: RootState) => ({
  experiments: getExperiments(state),
});

export default connect(mapStateToProps)(NewStageScreen);
