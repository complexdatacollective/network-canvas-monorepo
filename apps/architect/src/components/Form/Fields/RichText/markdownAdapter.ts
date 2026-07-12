import markdown from 'remark-parse';
import { unified } from 'unified';

export type RichTextMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type RichTextContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextContent[];
  marks?: RichTextMark[];
  text?: string;
};

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  depth?: number;
  ordered?: boolean;
  start?: number;
  url?: string;
  title?: string | null;
  alt?: string;
};

const EMPTY_DOCUMENT: RichTextContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const cloneEmptyDocument = (): RichTextContent => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
});

/**
 * Matches the legacy Slate editor: literal ">" characters should remain text
 * instead of turning existing protocol content into block quotes on first edit.
 */
const escapeAngleBracket = (value = ''): string =>
  value.replace(/>/g, '&gt;').replace(/<br&gt;/g, '<br>');

const escapeMarkdownText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/(^\d+)+(\.)/g, '$1\\$2')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/-/g, '\\-')
    .replace(/(\s*)#+(\s)/g, '$1\\#$2')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');

const escapeLinkDestination = (value: string): string =>
  value
    .replace(/\\/g, '%5C')
    .replace(/\s/g, '%20')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/>/g, '%3E');

const escapeLinkTitle = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const LINK_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const SCHEME_DELIMITER_PATTERN = /[/?#]/;

type InlineParseOptions = {
  links?: boolean;
};

type SerializeInlineOptions = {
  links?: boolean;
};

const hasUnsafeSchemeCharacters = (href: string): boolean => {
  const colonIndex = href.indexOf(':');

  if (colonIndex === -1) {
    return false;
  }

  const delimiterIndex = href.search(SCHEME_DELIMITER_PATTERN);

  if (delimiterIndex !== -1 && delimiterIndex < colonIndex) {
    return false;
  }

  return /\s/.test(href.slice(0, colonIndex));
};

const hasControlCharacter = (href: string): boolean =>
  Array.from(href).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const sanitizeLinkDestination = (
  value: string | null | undefined,
): string | undefined => {
  const href = value?.trim();

  if (!href) {
    return undefined;
  }

  if (hasControlCharacter(href) || hasUnsafeSchemeCharacters(href)) {
    return undefined;
  }

  if (href.startsWith('//')) {
    try {
      const url = new URL(href, 'https://networkcanvas.local');
      return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : undefined;
    } catch {
      return undefined;
    }
  }

  if (!LINK_PROTOCOL_PATTERN.test(href)) {
    return href;
  }

  try {
    const url = new URL(href);
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
};

const addMark = (
  content: RichTextContent[],
  mark: RichTextMark,
): RichTextContent[] =>
  content.map((node) => {
    if (node.type === 'text') {
      return {
        ...node,
        marks: [...(node.marks ?? []), mark],
      };
    }

    return {
      ...node,
      content: node.content ? addMark(node.content, mark) : undefined,
    };
  });

const inlineFromMarkdown = (
  node: MarkdownNode,
  options: InlineParseOptions = {},
): RichTextContent[] => {
  switch (node.type) {
    case 'text':
      return node.value ? [{ type: 'text', text: node.value }] : [];

    case 'strong':
      return addMark(childrenAsInline(node, options), { type: 'bold' });

    case 'emphasis':
      return addMark(childrenAsInline(node, options), { type: 'italic' });

    case 'link': {
      const href = sanitizeLinkDestination(node.url);
      const content = childrenAsInline(node, options);

      if (!href || options.links === false) {
        return content;
      }

      return addMark(content, {
        type: 'link',
        attrs: {
          href,
          title: node.title ?? null,
        },
      });
    }

    case 'break':
      return [{ type: 'hardBreak' }];

    case 'inlineCode':
      return node.value ? [{ type: 'text', text: node.value }] : [];

    case 'html':
      return node.value?.toLowerCase() === '<br>'
        ? [{ type: 'hardBreak' }]
        : [];

    case 'image':
      return node.alt ? [{ type: 'text', text: node.alt }] : [];

    default:
      return childrenAsInline(node, options);
  }
};

const childrenAsInline = (
  node: MarkdownNode,
  options: InlineParseOptions = {},
): RichTextContent[] =>
  (node.children ?? []).flatMap((child) => inlineFromMarkdown(child, options));

const paragraphFromInline = (content: RichTextContent[]): RichTextContent =>
  content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };

const blockFromMarkdown = (node: MarkdownNode): RichTextContent[] => {
  switch (node.type) {
    case 'paragraph':
      return [paragraphFromInline(childrenAsInline(node))];

    case 'heading': {
      const level = Math.min(Math.max(node.depth ?? 1, 1), 4);
      return [
        {
          type: 'heading',
          attrs: { level },
          content: childrenAsInline(node),
        },
      ];
    }

    case 'list':
      return [
        {
          type: node.ordered ? 'orderedList' : 'bulletList',
          attrs: node.ordered ? { start: node.start ?? 1 } : undefined,
          content: (node.children ?? []).map((child) => ({
            type: 'listItem',
            content: blockChildrenFromMarkdown(child),
          })),
        },
      ];

    case 'thematicBreak':
      return [{ type: 'horizontalRule' }];

    case 'html':
      if (node.value?.toLowerCase() === '<hr>') {
        return [{ type: 'horizontalRule' }];
      }
      if (node.value?.toLowerCase() === '<br>') {
        return [paragraphFromInline([{ type: 'hardBreak' }])];
      }
      return [];

    default: {
      const content = childrenAsInline(node);
      return content.length > 0 ? [paragraphFromInline(content)] : [];
    }
  }
};

const blockChildrenFromMarkdown = (node: MarkdownNode): RichTextContent[] => {
  if (node.type !== 'listItem') {
    return blockFromMarkdown(node);
  }

  const children = (node.children ?? []).flatMap(blockFromMarkdown);
  return children.length > 0 ? children : [{ type: 'paragraph' }];
};

const inlineDocumentFromMarkdown = (root: MarkdownNode): RichTextContent => {
  const inlineContent = (root.children ?? []).flatMap((node, index) => {
    const content =
      node.type === 'paragraph' || node.type === 'heading'
        ? childrenAsInline(node, { links: false })
        : inlineFromMarkdown(node, { links: false });

    if (index === 0 || content.length === 0) {
      return content;
    }

    return [{ type: 'text', text: ' ' }, ...content];
  });

  return {
    type: 'doc',
    content: [paragraphFromInline(inlineContent)],
  };
};

export const markdownToRichTextContent = (
  value: string | null | undefined,
  inline = false,
): RichTextContent => {
  if (!value || !/\S/.test(value)) {
    return cloneEmptyDocument();
  }

  const root = unified()
    .use(markdown)
    .parse(escapeAngleBracket(value)) as unknown as MarkdownNode;

  if (inline) {
    return inlineDocumentFromMarkdown(root);
  }

  const content = (root.children ?? []).flatMap(blockFromMarkdown);

  if (content.length === 0) {
    return cloneEmptyDocument();
  }

  return {
    type: 'doc',
    content,
  };
};

const getMark = (
  node: RichTextContent,
  markType: string,
): RichTextMark | undefined =>
  node.marks?.find((mark) => mark.type === markType);

const serializeTextNode = (
  node: RichTextContent,
  options: SerializeInlineOptions = {},
): string => {
  const text = escapeMarkdownText(node.text ?? '');
  const isBold = Boolean(getMark(node, 'bold'));
  const isItalic = Boolean(getMark(node, 'italic'));
  const link = getMark(node, 'link');

  let serialized = text;

  if (isBold && isItalic) {
    serialized = `***${serialized}***`;
  } else if (isBold) {
    serialized = `**${serialized}**`;
  } else if (isItalic) {
    serialized = `_${serialized}_`;
  }

  const href = link?.attrs?.href;

  if (typeof href === 'string' && options.links !== false) {
    const safeHref = sanitizeLinkDestination(href);
    const title = link?.attrs?.title;
    const titleText =
      typeof title === 'string' && title.trim() !== ''
        ? ` "${escapeLinkTitle(title)}"`
        : '';

    if (safeHref) {
      serialized = `[${serialized}](${escapeLinkDestination(safeHref)}${titleText})`;
    }
  }

  return serialized;
};

const serializeInline = (
  content: RichTextContent[] | undefined,
  options: SerializeInlineOptions = {},
): string =>
  (content ?? [])
    .map((node) => {
      if (node.type === 'text') {
        return serializeTextNode(node, options);
      }

      if (node.type === 'hardBreak') {
        return '  \n';
      }

      return serializeInline(node.content, options);
    })
    .join('');

const getInlineContent = (node: RichTextContent): RichTextContent[] => {
  switch (node.type) {
    case 'text':
    case 'hardBreak':
      return [node];

    case 'paragraph':
    case 'heading':
      return node.content ?? [];

    default:
      return flattenInlineContent(node.content);
  }
};

const flattenInlineContent = (
  content: RichTextContent[] | undefined,
): RichTextContent[] =>
  (content ?? []).flatMap((node, index) => {
    const inlineContent = getInlineContent(node);

    if (inlineContent.length === 0) {
      return [];
    }

    if (index === 0) {
      return inlineContent;
    }

    return [{ type: 'text', text: ' ' }, ...inlineContent];
  });

const indentBlock = (value: string): string =>
  value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

const serializeListItem = (
  node: RichTextContent,
  index: number,
  ordered: boolean,
  start: number,
): string => {
  const blocks = node.content ?? [];
  const [firstBlock, ...restBlocks] = blocks;
  const firstContent = firstBlock ? serializeBlock(firstBlock) : '';
  const marker = ordered ? `${start + index}. ` : '- ';
  const restContent = restBlocks.map(serializeBlock).filter(Boolean);

  if (restContent.length === 0) {
    return `${marker}${firstContent}`;
  }

  return [`${marker}${firstContent}`, ...restContent.map(indentBlock)].join(
    '\n',
  );
};

const serializeBlock = (node: RichTextContent): string => {
  switch (node.type) {
    case 'doc':
      return serializeBlocks(node.content);

    case 'paragraph':
      return serializeInline(node.content);

    case 'heading': {
      const rawLevel = node.attrs?.level;
      const level =
        typeof rawLevel === 'number' ? Math.min(Math.max(rawLevel, 1), 4) : 1;
      return `${'#'.repeat(level)} ${serializeInline(node.content)}`;
    }

    case 'bulletList':
      return (node.content ?? [])
        .map((child, index) => serializeListItem(child, index, false, 1))
        .join('\n');

    case 'orderedList': {
      const rawStart = node.attrs?.start;
      const start = typeof rawStart === 'number' ? rawStart : 1;
      return (node.content ?? [])
        .map((child, index) => serializeListItem(child, index, true, start))
        .join('\n');
    }

    case 'listItem':
      return serializeBlocks(node.content);

    case 'horizontalRule':
      return '---';

    case 'hardBreak':
      return '  \n';

    case undefined:
      return serializeInline(node.content);

    default:
      return serializeInline(node.content);
  }
};

const serializeBlocks = (content: RichTextContent[] | undefined): string =>
  (content ?? []).map(serializeBlock).filter(Boolean).join('\n\n');

const containsContent = (node: RichTextContent): boolean => {
  if (node.type === 'horizontalRule') {
    return true;
  }

  if (node.type === 'text') {
    return Boolean(node.text && /\S/.test(node.text));
  }

  return (node.content ?? []).some(containsContent);
};

export const richTextContentToMarkdown = (
  content: RichTextContent | null | undefined = EMPTY_DOCUMENT,
  inline = false,
): string => {
  if (!content || !containsContent(content)) {
    return '';
  }

  if (inline) {
    return serializeInline(flattenInlineContent(content.content), {
      links: false,
    });
  }

  return serializeBlock(content);
};
