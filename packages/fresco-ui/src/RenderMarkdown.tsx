'use client';

import {
  cloneElement,
  type ComponentType,
  createContext,
  createElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
  type Options,
  type UrlTransform,
} from 'react-markdown';

import { linkAddress } from './linkAddress';
import {
  BLOCK_IMAGE_ELEMENT,
  blockImageOf,
  type MarkdownBlockImage,
  rehypeBlockImages,
  remarkBlockImages,
} from './markdownBlockImages';
import { showHtmlAsTyped } from './markdownTypedHtml';
import { NativeLink } from './NativeLink';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';
import { OrderedList, UnorderedList } from './typography/UnorderedList';

/**
 * What text of one line is drawn with: the formatting the editor offers for
 * one line, bold and italics, and nothing else. A link, a list or anything
 * else markdown reads in one line is drawn as its words, as the editor shows
 * it, so what a participant sees is what the researcher saw when writing it.
 */
export const ALLOWED_MARKDOWN_LABEL_TAGS = ['em', 'strong'];
/** What text of several lines is drawn with: what the editor offers for it. */
export const ALLOWED_MARKDOWN_SECTION_TAGS = [
  'em',
  'strong',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'br',
  'hr',
];

// Text is read as standard CommonMark and nothing more: no syntax
// extensions, and no HTML. What the parser reads as HTML is shown as the
// characters typed (see `markdownTypedHtml`), as Architect's editor shows it.
// A caller whose text is not protocol text, such as release notes, may add
// plugins of its own; this one always runs first.
const showHtmlAsTypedPlugin = () => showHtmlAsTyped;

// A link is drawn only where its address passes the one rule the editor
// shares (see `linkAddress`); any other is drawn as its words. Every other
// address, such as an image's, keeps react-markdown's own handling.
const urlTransform: UrlTransform = (url, key, node) =>
  node.tagName === 'a' && key === 'href'
    ? (linkAddress(url) ?? null)
    : defaultUrlTransform(url);

const defaultMarkdownOptions = {
  allowedElements: ALLOWED_MARKDOWN_LABEL_TAGS,
  remarkPlugins: [showHtmlAsTypedPlugin],
  unwrapDisallowed: true,
  urlTransform,
} satisfies Options;

const renderedText = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(renderedText).join('');
  if (
    typeof node === 'object' &&
    node !== null &&
    isValidElement<{ children?: ReactNode }>(node)
  ) {
    return renderedText(node.props.children);
  }
  return '';
};

/**
 * The text RenderMarkdown shows for markdown with its default options: the
 * label elements, with every other element unwrapped and HTML shown as typed.
 * Does not apply custom components or section options. Useful for grammar
 * around an unchanged authored label.
 */
const getMarkdownLabelText = (markdown: string): string =>
  // react-markdown's synchronous entry point processes to an intrinsic React
  // tree without hooks. Reading that tree also includes its final allow-list
  // and URL processing, without a second parser or a browser/server render.
  renderedText(
    ReactMarkdown({ ...defaultMarkdownOptions, children: markdown }),
  );

const attributeText = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(attributeText);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return Object.entries(node.props).flatMap(([key, value]) => {
    if (key === 'children') return attributeText(value);
    return typeof value === 'string' ? [value] : [];
  });
};

/**
 * Every attribute value (a link's destination or title, an image's source or
 * text) that RenderMarkdown produces from markdown with its default options,
 * with every element allowed. Lets a caller that splices text into markdown find
 * where the parser put it without a second parser.
 */
const getMarkdownAttributeValues = (markdown: string): string[] =>
  attributeText(
    ReactMarkdown({
      ...defaultMarkdownOptions,
      allowedElements: undefined,
      children: markdown,
    }),
  );

// Open links in the OS browser, never inside the app. `window.open` is the one
// call that does the right thing on every target: Electron's
// setWindowOpenHandler routes it to shell.openExternal, Capacitor sends
// http(s) to the system browser, and the web build opens a new tab.
// preventDefault stops the anchor's own navigation (which on Electron/Capacitor
// would otherwise try to load the URL inside the app shell).
const openExternal = (href: string) => (event: MouseEvent) => {
  event.preventDefault();
  window.open(href, '_blank', 'noopener,noreferrer');
};

const externalLinkRenderer = ({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) =>
  href ? (
    <NativeLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openExternal(href)}
    >
      {children}
    </NativeLink>
  ) : (
    <>{children}</>
  );

const defaultMarkdownRenderers = {
  a: externalLinkRenderer,
  h1: ({ children }: { children?: ReactNode }) => (
    <Heading level="h1">{children}</Heading>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <Heading level="h2">{children}</Heading>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <Heading level="h3">{children}</Heading>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <Heading level="h4">{children}</Heading>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <Heading level="h4">{children}</Heading>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <Heading level="h4">{children}</Heading>
  ),
  p: Paragraph,
  ul: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <UnorderedList className={className}>{children}</UnorderedList>,
  ol: ({
    children,
    className,
  }: {
    children?: ReactNode;
    className?: string;
  }) => <OrderedList className={className}>{children}</OrderedList>,
} satisfies Components;

/**
 * Images the markdown shows as blocks the caller draws, such as the files of
 * a protocol (see `markdownBlockImages`). Any other image is not shown, as
 * no image is without this.
 */
export type MarkdownBlockImages = Readonly<{
  /** Whether an image's address is one the caller draws. */
  matches: (url: string) => boolean;
  /** Draws the block for one such image. */
  Block: ComponentType<MarkdownBlockImage>;
}>;

/** How the caller draws a block, for the element standing for one. */
const BlockImageContext =
  createContext<ComponentType<MarkdownBlockImage> | null>(null);

/**
 * The element a block image was placed as, drawn by the caller. Any other
 * element of that name is unwrapped, as it was before the name was allowed.
 */
function BlockImageElement({
  node,
  children,
}: {
  node?: { properties?: Record<string, unknown> };
  children?: ReactNode;
}) {
  const Block = useContext(BlockImageContext);
  const image = blockImageOf(node?.properties);
  if (Block === null || image === undefined) return <>{children}</>;
  // The caller's component, which it keeps the same between renders.
  return createElement(Block, image);
}

type RenderMarkdownProps = Options & {
  render?: ReactElement;
  blockImages?: MarkdownBlockImages;
};

const RenderMarkdown = ({
  children,
  render,
  allowedElements,
  components,
  remarkPlugins,
  rehypePlugins,
  unwrapDisallowed,
  blockImages,
  ...props
}: RenderMarkdownProps) => {
  const matches = blockImages?.matches;
  // Made once for each way of telling the caller's images apart, rather
  // than on every render.
  const remarkBlocks = useMemo(
    () => (matches === undefined ? undefined : remarkBlockImages(matches)),
    [matches],
  );
  const allowed = allowedElements ?? defaultMarkdownOptions.allowedElements;
  const remark = [
    ...defaultMarkdownOptions.remarkPlugins,
    ...(remarkPlugins ?? []),
  ];
  const rehype = rehypePlugins ?? [];

  const markdownContent = (
    <ReactMarkdown
      allowedElements={
        remarkBlocks === undefined ? allowed : [...allowed, BLOCK_IMAGE_ELEMENT]
      }
      components={{
        ...defaultMarkdownRenderers,
        ...components,
        ...(remarkBlocks !== undefined && {
          [BLOCK_IMAGE_ELEMENT]: BlockImageElement,
        }),
      }}
      remarkPlugins={
        remarkBlocks === undefined ? remark : [...remark, remarkBlocks]
      }
      // Last, on the finished structure (see `markdownBlockImages`).
      rehypePlugins={
        remarkBlocks === undefined ? rehype : [...rehype, rehypeBlockImages]
      }
      unwrapDisallowed={
        unwrapDisallowed ?? defaultMarkdownOptions.unwrapDisallowed
      }
      urlTransform={defaultMarkdownOptions.urlTransform}
      {...props}
    >
      {children}
    </ReactMarkdown>
  );

  const content =
    blockImages === undefined ? (
      markdownContent
    ) : (
      <BlockImageContext.Provider value={blockImages.Block}>
        {markdownContent}
      </BlockImageContext.Provider>
    );

  if (render) {
    return cloneElement(render, undefined, content);
  }

  return content;
};

export { getMarkdownAttributeValues, getMarkdownLabelText, RenderMarkdown };
