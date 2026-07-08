import { EditListPlugin } from '@productboard/slate-edit-list';
import { isEmpty } from 'es-toolkit/compat';
import { isHotkey } from 'is-hotkey';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createEditor,
  type Descendant,
  type Editor,
  Transforms as SlateTransforms,
} from 'slate';
import type { HistoryEditor } from 'slate-history';
import { withHistory } from 'slate-history';
import { Editable, type ReactEditor, Slate, withReact } from 'slate-react';

import { cx } from '~/utils/cva';

import Element from './Element';
import Leaf from './Leaf';
import { toggleMark } from './lib/actions';
import { ALWAYS_DISALLOWED, INLINE_DISALLOWED_ITEMS } from './lib/options';
import parse, { defaultValue } from './lib/parse';
import serialize from './lib/serialize';
import withNormalize from './lib/withNormalize';
import withVoids from './lib/withVoids';
import RichTextContainer from './RichTextContainer';
import Toolbar from './Toolbar';

type CustomEditor = Editor &
  ReactEditor &
  HistoryEditor & {
    inline?: boolean;
    disallowedTypes?: string[];
  };

type RichTextProps = {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  inline?: boolean;
  disallowedTypes?: string[];
  autoFocus?: boolean;
  hasError?: boolean;
};

const HOTKEYS: Record<string, string> = {
  'mod+b': 'bold',
  'mod+i': 'italic',
};

const [withEditList, listOnKeyDown] = EditListPlugin({
  maxDepth: 1, // Restrict list depth to one, for now.
});

const hotkeyOnKeyDown =
  (editor: CustomEditor) => (event: React.KeyboardEvent) => {
    Object.keys(HOTKEYS).forEach((hotkey) => {
      if (isHotkey(hotkey, event)) {
        event.preventDefault();
        const mark = HOTKEYS[hotkey];
        if (mark) {
          toggleMark(editor, mark);
        }
      }
    });
  };

/**
 * This rich text component is UI for editing markdown.
 *
 * It uses the `slate` library to manage the document,
 * which uses it's own tree-like structure internally,
 * and parse and serialize methods to read and set the
 * value externally.
 *
 * Slate's internal tree is not specific to markdown,
 * the element types and leaf types are arbitrary - in
 * this case we are using the types provided by our
 * very opinionated serialize/parse library `remark-slate`.
 *
 * The other notable feature is our normalizer. When
 * document is updated, this method is run for each node
 * and is how we restrict block types and force single
 * line mode.
 *
 * This editor has two props that set its operation:
 * - 'inline' (bool):
 *   determines if elements that would cause a line
 *   break or block level element can be created.
 *   Default is false.
 *
 * - 'disallowedTypes' (array):
 *   Array containing any 'type' listed in options.js
 *   which will then be excluded from the toolbar and
 *   markdown shortcuts.
 *
 * @param {bool} autoFocus Focus input automatically when
 * rendered.
 * @param {bool} inline determines if elements that would
 * cause a line break or block level element can be created.
 * @param {array} disallowedTypes Array containing any
 * 'type' listed in options.js which will then be excluded
 * from the toolbar and markdown shortcuts.
 * @param {func} onChange Will receive a markdown value when
 * the document changes
 * @param {string} value Expects a value which will be used
 * as the *starting* value for the field, will not be used
 * subsequently as state is managed internally.
 */

const RichText = ({
  autoFocus = false,
  inline = false,
  disallowedTypes = [],
  onChange = () => {},
  value: initialValue = '',
  placeholder = 'Enter some text...',
  hasError = false,
}: RichTextProps) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [value, setValue] = useState<Descendant[]>(defaultValue);
  const [lastChange, setLastChange] = useState(initialValue);

  // Use the inline prop to optionally merge additional disallowed items
  const disallowedTypesWithDefaults = useMemo(
    () => [
      ...disallowedTypes,
      ...(inline ? INLINE_DISALLOWED_ITEMS : []),
      ...ALWAYS_DISALLOWED,
    ],
    [disallowedTypes, inline],
  );

  const withOptions = useCallback(
    (e: Editor) => {
      const customE = e as CustomEditor;
      customE.inline = inline;
      customE.disallowedTypes = disallowedTypesWithDefaults;
      return customE;
    },
    [inline, disallowedTypesWithDefaults],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: fix runtime error
  const editor = useMemo(() => {
    const baseEditor = createEditor();
    const withReactEditor = withReact(baseEditor);
    const withHistoryEditor = withHistory(withReactEditor);
    const withListEditor = withEditList(withHistoryEditor);
    const withNormalizeEditor = withNormalize(withListEditor);
    const withVoidsEditor = withVoids(withNormalizeEditor);
    const withOptionsEditor = withOptions(withVoidsEditor);
    return withOptionsEditor;
  }, [disallowedTypesWithDefaults.join()]);

  // Test if there is no text content in the tree
  const childrenAreEmpty = useCallback((children: Descendant[]): boolean => {
    const checkEmpty = (nodes: Descendant[]): boolean =>
      nodes.every((child) => {
        // Thematic break has no text, but still counts as content.
        if ('type' in child && child.type === 'thematic_break') {
          return false;
        }

        if ('children' in child && child.children) {
          return checkEmpty(child.children);
        }

        // The regexp here means that content only containing spaces or
        // tabs will be considered empty!
        if ('text' in child) {
          return isEmpty(child.text) || !/\S/.test(child.text);
        }

        return true;
      });
    return checkEmpty(children);
  }, []);

  // Serialize a concrete node tree. Empty content serializes to '' so a blank
  // field round-trips to an empty string rather than a stray paragraph.
  const serializeValue = useCallback(
    (nodes: Descendant[]): string => {
      if (childrenAreEmpty(nodes)) {
        return '';
      }
      return serialize(nodes, inline);
    },
    [childrenAreEmpty, inline],
  );

  const getSerializedValue = useCallback(
    () => serializeValue(value),
    [serializeValue, value],
  );

  const setInitialValue = useCallback(
    () =>
      parse(initialValue).then((parsedValue) => {
        // we need to reset the cursor state because the value length may have changed
        SlateTransforms.deselect(editor);
        setValue(parsedValue);
        return parsedValue;
      }),
    [editor, initialValue],
  );

  // Set starting state from prop value on start up
  // biome-ignore lint/correctness/useExhaustiveDependencies: infinite runtime error
  useEffect(() => {
    setInitialValue().then((parsedValue) => {
      // Seed lastChange with the round-tripped value so the "update upstream"
      // effect below doesn't emit an onChange when the stored markdown merely
      // isn't a serialize(parse()) fixed point — that would dirty the form,
      // insert a phantom undo step, and silently rewrite the stored value on
      // open. A real edit produces a different value and emits normally.
      setLastChange(serializeValue(parsedValue));
      setIsInitialized(true);
    });
  }, []);

  // Set value again when initial value changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: fix runtime error
  useEffect(() => {
    // If value matches the last reported change do not set value;
    if (initialValue === lastChange) {
      return;
    }
    setInitialValue().then((parsedValue) => {
      // Reseed lastChange for the same reason as the mount effect: an external
      // prop update must not be treated as a local edit, or the "update
      // upstream" effect would emit a spurious onChange that dirties the form
      // and rewrites the incoming markdown.
      setLastChange(serializeValue(parsedValue));
    });
  }, [initialValue, setInitialValue]);

  // Update upstream on change
  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const nextValue = getSerializedValue();

    // Is this optimization necessary?
    if (nextValue === lastChange) {
      return;
    }

    setLastChange(nextValue);
    onChange(nextValue);
  }, [getSerializedValue, isInitialized, lastChange, onChange]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      hotkeyOnKeyDown(editor)(event);
      listOnKeyDown(editor as Editor)(event);
    },
    [editor],
  );

  // Loading state - don't render Slate until we initialize
  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return (
    <Slate
      editor={editor}
      initialValue={value}
      value={value}
      onChange={setValue}
    >
      <RichTextContainer hasError={hasError}>
        <Toolbar />
        <div
          className={cx(
            'text-input-contrast cursor-text px-5 py-0',
            'border-b-2 border-b-transparent',
            'transition-colors duration-300 ease-in-out',
            'group-hover:border-b-input-active group-data-[active]:border-b-input-active',
            'focus-within:outline-none focus:outline-none [&_[contenteditable]]:outline-none',
            '[&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-7',
            '[&_ol]:my-5 [&_ol]:list-decimal [&_ol]:pl-7',
            '[&_li]:my-1 [&_li_p]:m-0',
            !inline && 'resize-y overflow-auto',
          )}
        >
          <Editable
            renderElement={Element}
            renderLeaf={Leaf}
            placeholder={placeholder}
            spellCheck
            autoFocus={autoFocus}
            onKeyDown={handleKeyDown}
          />
        </div>
      </RichTextContainer>
    </Slate>
  );
};

export default RichText;
