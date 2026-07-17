'use client';

import {
  cloneElement,
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

const ALLOWED_MARKDOWN_LABEL_TAGS = ['em', 'strong', 'ul', 'ol', 'li', 'a'];
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
      allowedElements={allowedElements ?? ALLOWED_MARKDOWN_LABEL_TAGS}
      components={{
        ...defaultMarkdownRenderers,
        ...components,
      }}
      remarkPlugins={remarkPlugins ?? [remarkGemoji, remarkGfm]}
      rehypePlugins={rehypePlugins ?? [rehypeRaw, rehypeSanitize]}
      unwrapDisallowed={unwrapDisallowed ?? true}
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

export { RenderMarkdown };
