'use client';

import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';

import { NativeLink } from './NativeLink';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';
import { OrderedList, UnorderedList } from './typography/UnorderedList';

export const ALLOWED_MARKDOWN_LABEL_TAGS = [
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'a',
];
export const ALLOWED_MARKDOWN_SECTION_TAGS = [
  ...ALLOWED_MARKDOWN_LABEL_TAGS,
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'br',
  'hr',
  'a',
];

/**
 * The HTML handling every rendering gets unless it passes its own: raw HTML
 * is parsed, then sanitized. A caller adding a plugin of its own appends it to
 * these, so it runs on sanitized output.
 */
export const DEFAULT_MARKDOWN_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

const defaultMarkdownOptions = {
  allowedElements: ALLOWED_MARKDOWN_LABEL_TAGS,
  remarkPlugins: [remarkGemoji, remarkGfm],
  rehypePlugins: DEFAULT_MARKDOWN_REHYPE_PLUGINS,
  unwrapDisallowed: true,
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
 * Text produced by RenderMarkdown's default label dialect, including GFM,
 * emoji, sanitized HTML and unwrapped tags. Does not apply custom components
 * or section options. Useful for grammar around an unchanged authored label.
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
 * text) that RenderMarkdown's default dialect produces from markdown, with
 * every element allowed. Lets a caller that splices text into markdown find
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

type RenderMarkdownProps = Options & {
  render?: ReactElement;
};

const RenderMarkdown = ({
  children,
  render,
  allowedElements,
  components,
  remarkPlugins,
  rehypePlugins,
  unwrapDisallowed,
  ...props
}: RenderMarkdownProps) => {
  const markdownContent = (
    <ReactMarkdown
      allowedElements={
        allowedElements ?? defaultMarkdownOptions.allowedElements
      }
      components={{
        ...defaultMarkdownRenderers,
        ...components,
      }}
      remarkPlugins={remarkPlugins ?? defaultMarkdownOptions.remarkPlugins}
      rehypePlugins={rehypePlugins ?? defaultMarkdownOptions.rehypePlugins}
      unwrapDisallowed={
        unwrapDisallowed ?? defaultMarkdownOptions.unwrapDisallowed
      }
      {...props}
    >
      {children}
    </ReactMarkdown>
  );

  if (render) {
    return cloneElement(render, undefined, markdownContent);
  }

  return markdownContent;
};

export { getMarkdownAttributeValues, getMarkdownLabelText, RenderMarkdown };
