import { includes } from 'es-toolkit/compat';
import type { Editor } from 'slate';
import type { HistoryEditor } from 'slate-history';
import type { ReactEditor } from 'slate-react';
import { useSlate } from 'slate-react';

import { isBlockActive, smartInsertThematicBreak } from './lib/actions';
import { toggleBlockquote } from './lib/blockquotes';
import { TOOLBAR_ITEMS } from './lib/options';
import { BlockButton, MarkButton, ToolbarButton } from './ToolbarButton';

type CustomEditor = Editor &
  ReactEditor &
  HistoryEditor & {
    disallowedTypes?: string[];
  };

const Spacer = () => (
  <div className="bg-platinum-dark mx-(--space-sm) h-(--space-lg) w-0.5 flex-none" />
);

const Toolbar = () => {
  const editor = useSlate() as CustomEditor;
  const { disallowedTypes = [] } = editor;
  const filteredItems = TOOLBAR_ITEMS.filter(
    (item) => !disallowedTypes.includes(item),
  );

  return (
    <div className="bg-platinum flex items-center justify-start px-(--space-md)">
      {includes(filteredItems, 'bold') && (
        <MarkButton format="bold" icon="bold" tooltip="Bold" />
      )}
      {includes(filteredItems, 'italic') && (
        <MarkButton format="italic" icon="italic" tooltip="Italic" />
      )}
      {includes(filteredItems, 'headings') && (
        <>
          <Spacer />
          <BlockButton format="heading_one" icon="h1" tooltip="Heading One" />
          <BlockButton format="heading_two" icon="h2" tooltip="Heading Two" />
          <BlockButton
            format="heading_three"
            icon="h3"
            tooltip="Heading Three"
          />
          <BlockButton format="heading_four" icon="h4" tooltip="Heading Four" />
        </>
      )}
      {includes(filteredItems, 'quote') && (
        <>
          <Spacer />
          <ToolbarButton
            icon="quote"
            tooltip="Quote"
            isActive={isBlockActive(editor, 'block_quote')}
            action={() => toggleBlockquote(editor)}
          />
        </>
      )}
      {includes(filteredItems, 'lists') && (
        <>
          <Spacer />
          <BlockButton format="ol_list" icon="ol" tooltip="Numbered List" />
          <BlockButton format="ul_list" icon="ul" tooltip="Bulleted List" />
        </>
      )}
      {includes(filteredItems, 'thematic_break') && (
        <>
          <Spacer />
          <ToolbarButton
            action={() => smartInsertThematicBreak(editor)}
            icon="hr"
            tooltip="Thematic Break"
          />
        </>
      )}
      {includes(filteredItems, 'history') && (
        <>
          <Spacer />
          <ToolbarButton icon="undo" tooltip="Undo" action={editor.undo} />
          <ToolbarButton icon="redo" tooltip="Redo" action={editor.redo} />
        </>
      )}
    </div>
  );
};

export default Toolbar;
