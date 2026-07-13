import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import type { AnyExtension } from '@tiptap/core';
import { BulletList } from '@tiptap/extension-bullet-list';
import { Heading } from '@tiptap/extension-heading';
import { OrderedList } from '@tiptap/extension-ordered-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import {
  EditorContent,
  type JSONContent,
  useEditor,
  useEditorState,
} from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Redo,
  Trash2,
  Undo,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import Button, { iconButtonVariants } from '../../Button';
import { Popover, PopoverContent, PopoverTrigger } from '../../Popover';
import {
  controlVariants,
  inputControlVariants,
  interactiveStateVariants,
  multilineContentVariants,
  stateVariants,
} from '../../styles/controlVariants';
import { headingVariants } from '../../typography/Heading';
import { paragraphVariants } from '../../typography/Paragraph';
import { compose, cva, cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { getInputState } from '../utils/getInputState';
import InputField from './InputField';

const ToolbarToggleButton = (props: Toolbar.Button.Props) => {
  return <Toolbar.Button {...props} render={<Toggle />} />;
};

const ToolbarButton = (props: Toolbar.Button.Props) => {
  return <Toolbar.Button {...props} />;
};

// Get the classes from the typography components
const paragraphClasses = paragraphVariants();
const h1Classes = headingVariants({ level: 'h1' });
const h2Classes = headingVariants({ level: 'h2' });
const h3Classes = headingVariants({ level: 'h3' });
const h4Classes = headingVariants({ level: 'h4' });

type ExtensionOptions = {
  headingLevels: (1 | 2 | 3 | 4)[];
  enableBulletList: boolean;
  enableOrderedList: boolean;
  enableLinks: boolean;
  enableThematicBreak: boolean;
  placeholder?: string;
};

// Factory function to create custom extensions with typography classes
// Using a function with explicit return type to satisfy ESLint's strict type checking
function createCustomExtensions({
  headingLevels,
  enableBulletList,
  enableOrderedList,
  enableLinks,
  enableThematicBreak,
  placeholder,
}: ExtensionOptions): AnyExtension[] {
  const CustomParagraph = Paragraph.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return ['p', { ...HTMLAttributes, class: paragraphClasses }, 0];
    },
  });

  const CustomHeading = Heading.extend({
    renderHTML({ node, HTMLAttributes }): DOMOutputSpec {
      const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
      const classMap: Record<number, string> = {
        1: h1Classes,
        2: h2Classes,
        3: h3Classes,
        4: h4Classes,
      };
      return [
        `h${level}`,
        { ...HTMLAttributes, class: classMap[level] ?? h1Classes },
        0,
      ];
    },
  });

  const CustomBulletList = BulletList.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return [
        'ul',
        { ...HTMLAttributes, class: 'ml-8 list-disc [&>li]:not-last:mb-2' },
        0,
      ];
    },
  });

  const CustomOrderedList = OrderedList.extend({
    renderHTML({ HTMLAttributes }): DOMOutputSpec {
      return [
        'ol',
        { ...HTMLAttributes, class: 'ml-8 list-decimal [&>li]:not-last:mb-2' },
        0,
      ];
    },
  });

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      blockquote: false,
      paragraph: false,
      heading: false,
      bulletList: false,
      orderedList: false,
      code: false,
      codeBlock: false,
      horizontalRule: enableThematicBreak
        ? { HTMLAttributes: { class: 'my-4 border-current/30' } }
        : false,
      link: enableLinks
        ? {
            openOnClick: false,
            protocols: ['mailto'],
            HTMLAttributes: {
              class: 'text-link underline underline-offset-4',
              rel: 'noopener noreferrer',
              target: '_blank',
            },
          }
        : false,
      strike: false,
      underline: false,
    }),
    CustomParagraph,
  ];

  if (headingLevels.length > 0) {
    extensions.push(
      CustomHeading.configure({
        levels: headingLevels,
      }),
    );
  }

  if (enableBulletList) {
    extensions.push(CustomBulletList);
  }

  if (enableOrderedList) {
    extensions.push(CustomOrderedList);
  }

  if (placeholder) {
    extensions.push(
      Placeholder.configure({
        placeholder,
      }),
    );
  }

  return extensions;
}

const editorContainerVariants = compose(
  controlVariants,
  inputControlVariants,
  stateVariants,
  interactiveStateVariants,
  cva({
    base: 'flex h-auto w-full min-w-0 flex-col',
  }),
);

const toolbarStyles = cx(
  'bg-surface-1 text-surface-1-contrast publish-colors order-1 flex w-max min-w-full items-center gap-1 border-b border-current/10 px-6 py-2',
);

const toolbarGroupStyles = cx('flex items-center');

const toolbarButtonStyles = iconButtonVariants({
  size: 'sm',
  variant: 'text',
  className:
    'text-base data-pressed:bg-primary data-pressed:text-primary-contrast [&>.lucide]:h-[1.2em] [&>.lucide]:w-[1.2em] [&>.lucide]:[stroke-width:2.4]',
});

const toolbarSeparatorStyles = cx('mx-2 h-5 w-px shrink-0 bg-current/20');

const editorContentStyles = cx(
  multilineContentVariants(),
  'order-2 flex-1',
  'outline-none',
  '[&_.tiptap]:min-h-[120px] [&_.tiptap]:outline-none',
  // Placeholder styles
  '[&_.tiptap_p.is-editor-empty:first-child::before]:text-input-contrast/50',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:float-left',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:h-0',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:italic',
  '[&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
);

type ToolbarOptions = {
  bold?: boolean;
  italic?: boolean;
  links?: boolean;
  headings?:
    | boolean
    | { h1?: boolean; h2?: boolean; h3?: boolean; h4?: boolean };
  lists?: boolean | { bullet?: boolean; ordered?: boolean };
  thematicBreak?: boolean;
  history?: boolean;
};

const defaultToolbarOptions: Required<ToolbarOptions> = {
  bold: true,
  italic: true,
  links: false,
  headings: true,
  lists: true,
  thematicBreak: false,
  history: true,
};

type ChangeMode = 'blur' | 'input';

type EditorSelectionRange = {
  from: number;
  to: number;
};

type RichTextEditorFieldProps = CreateFormFieldProps<
  JSONContent,
  'div',
  {
    'toolbarOptions'?: ToolbarOptions;
    'changeMode'?: ChangeMode;
    'autoFocus'?: boolean;
    'placeholder'?: string;
    'id': string;
    'name': string;
    'aria-describedby': string;
  }
>;

// Helper to normalize toolbar options into a flat structure
function normalizeToolbarOptions(options?: ToolbarOptions) {
  const merged = { ...defaultToolbarOptions, ...options };

  const headings =
    typeof merged.headings === 'boolean'
      ? {
          h1: merged.headings,
          h2: merged.headings,
          h3: merged.headings,
          h4: merged.headings,
        }
      : { h1: true, h2: true, h3: true, h4: true, ...merged.headings };

  const lists =
    typeof merged.lists === 'boolean'
      ? { bullet: merged.lists, ordered: merged.lists }
      : { bullet: true, ordered: true, ...merged.lists };

  return {
    bold: merged.bold ?? true,
    italic: merged.italic ?? true,
    headings,
    lists,
    links: merged.links ?? false,
    thematicBreak: merged.thematicBreak ?? false,
    history: merged.history ?? true,
  };
}

export default function RichTextEditorField({
  id,
  name,
  value,
  onChange,
  disabled,
  readOnly,
  toolbarOptions,
  changeMode = 'blur',
  autoFocus = false,
  placeholder,
  className,
  onFocus,
  onBlur,
  ...props
}: RichTextEditorFieldProps) {
  const skipNextContentSyncRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const changeModeRef = useRef(changeMode);
  const linkSelectionRef = useRef<EditorSelectionRange | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [linkHref, setLinkHref] = useState('');
  const [linkValidationMessage, setLinkValidationMessage] = useState('');
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const options = normalizeToolbarOptions(toolbarOptions);
  const editorId = id ?? name ?? 'rich-text-editor';
  const editorName = name ?? editorId;
  const linkInputId = `${editorId}-link-url`;
  const linkErrorId = `${linkInputId}-error`;
  const ariaDescribedBy = props['aria-describedby'];
  const ariaInvalid = props['aria-invalid'];
  const ariaLabel = props['aria-label'];
  const ariaLabelledBy = props['aria-labelledby'];
  const ariaRequired = props['aria-required'];

  onChangeRef.current = onChange;
  changeModeRef.current = changeMode;

  const inputState = getInputState({
    disabled,
    readOnly,
    'aria-invalid': ariaInvalid,
  });
  const editorAttributes = useMemo<Record<string, string>>(() => {
    const attributes: Record<string, string> = {
      'role': 'textbox',
      'aria-multiline': 'true',
      'name': editorName,
      'id': editorId,
    };

    if (ariaLabelledBy) {
      attributes['aria-labelledby'] = ariaLabelledBy;
    } else {
      attributes['aria-label'] = ariaLabel ?? editorName;
    }

    if (ariaDescribedBy) {
      attributes['aria-describedby'] = ariaDescribedBy;
    }

    if (ariaInvalid || inputState === 'invalid') {
      attributes['aria-invalid'] = 'true';
    }

    if (ariaRequired) {
      attributes['aria-required'] = 'true';
    }

    if (disabled) {
      attributes['aria-disabled'] = 'true';
    }

    if (readOnly) {
      attributes['aria-readonly'] = 'true';
    }

    if (placeholder) {
      attributes['aria-placeholder'] = placeholder;
      attributes['data-placeholder'] = placeholder;
    }

    return attributes;
  }, [
    ariaDescribedBy,
    ariaInvalid,
    ariaLabel,
    ariaLabelledBy,
    ariaRequired,
    disabled,
    editorId,
    editorName,
    inputState,
    placeholder,
    readOnly,
  ]);

  // Compute which heading levels are enabled
  const headingLevels = useMemo(
    () =>
      (
        [
          options.headings.h1 && 1,
          options.headings.h2 && 2,
          options.headings.h3 && 3,
          options.headings.h4 && 4,
        ] as const
      ).filter((level): level is 1 | 2 | 3 | 4 => typeof level === 'number'),
    [
      options.headings.h1,
      options.headings.h2,
      options.headings.h3,
      options.headings.h4,
    ],
  );
  const editorExtensions = useMemo(
    () =>
      createCustomExtensions({
        headingLevels,
        enableBulletList: options.lists.bullet,
        enableOrderedList: options.lists.ordered,
        enableLinks: options.links,
        enableThematicBreak: options.thematicBreak,
        placeholder,
      }),
    [
      headingLevels,
      options.lists.bullet,
      options.lists.ordered,
      options.links,
      options.thematicBreak,
      placeholder,
    ],
  );

  const editor = useEditor(
    {
      editorProps: {
        attributes: editorAttributes,
      },
      extensions: editorExtensions,
      content: value,
      editable: !disabled && !readOnly,
      autofocus: autoFocus ? 'end' : false,
      onUpdate: ({ editor: updateEditor }) => {
        if (changeModeRef.current === 'input') {
          skipNextContentSyncRef.current = true;
          onChangeRef.current?.(updateEditor.getJSON());
        }
      },
      onBlur: ({ editor: blurEditor }) => {
        if (changeModeRef.current === 'blur') {
          skipNextContentSyncRef.current = true;
          onChangeRef.current?.(blurEditor.getJSON());
        }
      },
    },
    [autoFocus, editorExtensions],
  );

  // Track editor state changes to update toolbar button states
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isBold: e?.isActive('bold') ?? false,
      isItalic: e?.isActive('italic') ?? false,
      isH1: e?.isActive('heading', { level: 1 }) ?? false,
      isH2: e?.isActive('heading', { level: 2 }) ?? false,
      isH3: e?.isActive('heading', { level: 3 }) ?? false,
      isH4: e?.isActive('heading', { level: 4 }) ?? false,
      isLink: e?.isActive('link') ?? false,
      isBulletList: e?.isActive('bulletList') ?? false,
      isOrderedList: e?.isActive('orderedList') ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  useEffect(() => {
    if (!editor) return;

    if (value === undefined) {
      skipNextContentSyncRef.current = false;
      if (!editor.isEmpty) {
        editor.commands.clearContent(false);
      }
      return;
    }

    if (skipNextContentSyncRef.current) {
      skipNextContentSyncRef.current = false;
      return;
    }

    if (editor.isFocused) return;

    const currentContent = JSON.stringify(editor.getJSON());
    const newContent = JSON.stringify(value);
    if (currentContent !== newContent) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled && !readOnly);
    }
  }, [editor, disabled, readOnly]);

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: editorAttributes,
        },
      });
    }
  }, [editor, editorAttributes]);

  if (!editor) {
    return null;
  }

  const isDisabled = Boolean(disabled) || Boolean(readOnly);

  const getActiveFormattingValues = () => {
    const values: string[] = [];
    if (editorState.isBold) values.push('bold');
    if (editorState.isItalic) values.push('italic');
    return values;
  };

  const getActiveHeadingValue = () => {
    if (editorState.isH1) return ['h1'];
    if (editorState.isH2) return ['h2'];
    if (editorState.isH3) return ['h3'];
    if (editorState.isH4) return ['h4'];
    return [];
  };

  const getActiveListValue = () => {
    if (editorState.isBulletList) return ['bullet'];
    if (editorState.isOrderedList) return ['ordered'];
    return [];
  };

  const prepareLinkPopoverState = () => {
    const previousHref = editor.getAttributes('link').href;
    const { from, to } = editor.state.selection;

    linkSelectionRef.current = { from, to };
    setLinkHref(typeof previousHref === 'string' ? previousHref : '');
    setIsEditingExistingLink(typeof previousHref === 'string');
    setLinkValidationMessage('');
  };

  const setLinkPopoverOpen = (open: boolean) => {
    if (open) {
      prepareLinkPopoverState();
    }

    if (!open) {
      setLinkValidationMessage('');
    }

    setIsLinkPopoverOpen(open);
  };

  const restoreLinkSelection = ({
    extendLinkRange = false,
  }: { extendLinkRange?: boolean } = {}) => {
    const selection = linkSelectionRef.current;
    const chain = editor.chain().focus();

    if (selection) {
      chain.setTextSelection(selection);
    }

    if (extendLinkRange) {
      return chain.extendMarkRange('link');
    }

    return chain;
  };

  const applyLink = () => {
    const linkInput = linkInputRef.current;

    if (linkInput && !linkInput.checkValidity()) {
      setLinkValidationMessage(linkInput.validationMessage);
      linkInput.reportValidity();
      return;
    }

    const trimmedHref = (linkInputRef.current?.value ?? linkHref).trim();

    restoreLinkSelection({
      extendLinkRange: isEditingExistingLink,
    })
      .setLink({ href: trimmedHref })
      .run();

    setLinkValidationMessage('');
    setIsLinkPopoverOpen(false);
  };

  const removeLink = () => {
    restoreLinkSelection({ extendLinkRange: true }).unsetLink().run();
    setLinkHref('');
    setIsEditingExistingLink(false);
    setIsLinkPopoverOpen(false);
  };

  const selectLinkForEditing = () => {
    prepareLinkPopoverState();
  };

  const showTextFormatting = options.bold || options.italic || options.links;
  const showHeadings = headingLevels.length > 0;
  const showLists = options.lists.bullet || options.lists.ordered;
  const showThematicBreak = options.thematicBreak;
  const showHistory = options.history;

  // Track which groups are visible for separator logic
  const visibleGroups = [
    showTextFormatting,
    showHeadings,
    showLists,
    showThematicBreak,
    showHistory,
  ].filter(Boolean);
  const hasToolbar = visibleGroups.length > 0;

  return (
    <div
      className={editorContainerVariants({
        state: inputState,
        className,
      })}
      onFocus={onFocus}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        onBlur?.(event);
      }}
    >
      <EditorContent editor={editor} className={editorContentStyles} />
      {hasToolbar && (
        <Toolbar.Root className={toolbarStyles}>
          {showTextFormatting && (
            <Toolbar.Group className={toolbarGroupStyles}>
              <ToggleGroup
                className={toolbarGroupStyles}
                value={getActiveFormattingValues()}
                onValueChange={(values: string[]) => {
                  const shouldBeBold = values.includes('bold');
                  const shouldBeItalic = values.includes('italic');

                  if (shouldBeBold !== editorState.isBold) {
                    editor.chain().focus().toggleBold().run();
                  }
                  if (shouldBeItalic !== editorState.isItalic) {
                    editor.chain().focus().toggleItalic().run();
                  }
                }}
                multiple
              >
                {options.bold && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="bold"
                    aria-label="Bold"
                  >
                    <Bold />
                  </ToolbarToggleButton>
                )}
                {options.italic && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="italic"
                    aria-label="Italic"
                  >
                    <Italic />
                  </ToolbarToggleButton>
                )}
              </ToggleGroup>
              {options.links && (
                <Popover
                  open={isLinkPopoverOpen}
                  onOpenChange={setLinkPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <ToolbarButton
                      className={toolbarButtonStyles}
                      disabled={isDisabled}
                      aria-label={editorState.isLink ? 'Edit link' : 'Add link'}
                      aria-pressed={editorState.isLink}
                      data-pressed={editorState.isLink ? true : undefined}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectLinkForEditing();
                      }}
                    >
                      <Link />
                    </ToolbarButton>
                  </PopoverTrigger>
                  <PopoverContent align="start" side="bottom" className="w-80">
                    <form
                      className="flex flex-col gap-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        applyLink();
                      }}
                    >
                      <label
                        className="font-heading text-sm font-bold"
                        htmlFor={linkInputId}
                      >
                        Link URL
                      </label>
                      <InputField
                        ref={linkInputRef}
                        id={linkInputId}
                        name={linkInputId}
                        type="url"
                        required
                        value={linkHref}
                        onChange={(nextHref) => {
                          setLinkHref(nextHref ?? '');
                          setLinkValidationMessage('');
                        }}
                        onInvalid={(event) => {
                          setLinkValidationMessage(
                            event.currentTarget.validationMessage,
                          );
                        }}
                        placeholder="https://example.com"
                        size="sm"
                        autoFocus
                        aria-invalid={Boolean(linkValidationMessage)}
                        aria-describedby={
                          linkValidationMessage ? linkErrorId : undefined
                        }
                      />
                      <div
                        id={linkErrorId}
                        className="text-destructive min-h-5 text-sm leading-snug"
                        aria-live="polite"
                      >
                        {linkValidationMessage}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="text"
                          color="destructive"
                          icon={<Trash2 />}
                          aria-label="Remove link"
                          disabled={!isEditingExistingLink}
                          onClick={removeLink}
                        >
                          Remove
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          color="primary"
                          icon={<Check />}
                          aria-label="Apply link"
                          onClick={(event) => {
                            event.preventDefault();
                            applyLink();
                          }}
                        >
                          Apply
                        </Button>
                      </div>
                    </form>
                  </PopoverContent>
                </Popover>
              )}
            </Toolbar.Group>
          )}

          {showTextFormatting && showHeadings && (
            <Toolbar.Separator className={toolbarSeparatorStyles} />
          )}

          {showHeadings && (
            <Toolbar.Group className={toolbarGroupStyles}>
              <ToggleGroup
                className={toolbarGroupStyles}
                value={getActiveHeadingValue()}
                onValueChange={(values: string[]) => {
                  const newValue = values[0];
                  if (newValue === 'h1') {
                    editor.chain().focus().toggleHeading({ level: 1 }).run();
                  } else if (newValue === 'h2') {
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                  } else if (newValue === 'h3') {
                    editor.chain().focus().toggleHeading({ level: 3 }).run();
                  } else if (newValue === 'h4') {
                    editor.chain().focus().toggleHeading({ level: 4 }).run();
                  } else {
                    if (editorState.isH1) {
                      editor.chain().focus().toggleHeading({ level: 1 }).run();
                    } else if (editorState.isH2) {
                      editor.chain().focus().toggleHeading({ level: 2 }).run();
                    } else if (editorState.isH3) {
                      editor.chain().focus().toggleHeading({ level: 3 }).run();
                    } else if (editorState.isH4) {
                      editor.chain().focus().toggleHeading({ level: 4 }).run();
                    }
                  }
                }}
              >
                {options.headings.h1 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="h1"
                    aria-label="Heading 1"
                  >
                    <Heading1 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h2 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="h2"
                    aria-label="Heading 2"
                  >
                    <Heading2 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h3 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="h3"
                    aria-label="Heading 3"
                  >
                    <Heading3 />
                  </ToolbarToggleButton>
                )}
                {options.headings.h4 && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="h4"
                    aria-label="Heading 4"
                  >
                    <Heading4 />
                  </ToolbarToggleButton>
                )}
              </ToggleGroup>
            </Toolbar.Group>
          )}

          {(showTextFormatting || showHeadings) && showLists && (
            <Toolbar.Separator className={toolbarSeparatorStyles} />
          )}

          {showLists && (
            <Toolbar.Group className={toolbarGroupStyles}>
              <ToggleGroup
                className={toolbarGroupStyles}
                value={getActiveListValue()}
                onValueChange={(values: string[]) => {
                  const newValue = values[0];
                  if (newValue === 'bullet') {
                    if (!editorState.isBulletList) {
                      editor.chain().focus().toggleBulletList().run();
                    }
                  } else if (newValue === 'ordered') {
                    if (!editorState.isOrderedList) {
                      editor.chain().focus().toggleOrderedList().run();
                    }
                  } else {
                    if (editorState.isBulletList) {
                      editor.chain().focus().toggleBulletList().run();
                    } else if (editorState.isOrderedList) {
                      editor.chain().focus().toggleOrderedList().run();
                    }
                  }
                }}
              >
                {options.lists.ordered && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="ordered"
                    aria-label="Numbered list"
                  >
                    <ListOrdered />
                  </ToolbarToggleButton>
                )}
                {options.lists.bullet && (
                  <ToolbarToggleButton
                    className={toolbarButtonStyles}
                    disabled={isDisabled}
                    value="bullet"
                    aria-label="Bullet list"
                  >
                    <List />
                  </ToolbarToggleButton>
                )}
              </ToggleGroup>
            </Toolbar.Group>
          )}

          {(showTextFormatting || showHeadings || showLists) &&
            showThematicBreak && (
              <Toolbar.Separator className={toolbarSeparatorStyles} />
            )}

          {showThematicBreak && (
            <Toolbar.Group className={toolbarGroupStyles}>
              <ToolbarButton
                className={toolbarButtonStyles}
                disabled={isDisabled}
                aria-label="Thematic break"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
              >
                <Minus />
              </ToolbarButton>
            </Toolbar.Group>
          )}

          {(showTextFormatting ||
            showHeadings ||
            showLists ||
            showThematicBreak) &&
            showHistory && (
              <Toolbar.Separator className={toolbarSeparatorStyles} />
            )}

          {showHistory && (
            <Toolbar.Group className={toolbarGroupStyles}>
              <ToolbarButton
                className={toolbarButtonStyles}
                disabled={isDisabled || !editorState.canUndo}
                aria-label="Undo"
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo />
              </ToolbarButton>
              <ToolbarButton
                className={toolbarButtonStyles}
                disabled={isDisabled || !editorState.canRedo}
                aria-label="Redo"
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo />
              </ToolbarButton>
            </Toolbar.Group>
          )}
        </Toolbar.Root>
      )}
    </div>
  );
}
