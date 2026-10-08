'use client';

import {
  Children,
  cloneElement,
  type HTMLAttributes,
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
import {
  type PresentationalText,
  presentationalTextProps,
  presentationalTextValue,
} from './PresentationalText';
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

const defaultMarkdownOptions = {
  allowedElements: ALLOWED_MARKDOWN_LABEL_TAGS,
  remarkPlugins: [remarkGemoji, remarkGfm],
  rehypePlugins: [rehypeRaw, rehypeSanitize],
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

type LanguageAttributes = ReturnType<typeof presentationalTextProps>;

// Every element the renderers below produce forwards `lang` and `dir`, so a
// top-level one can be given the text's language (see `withLanguage`).
type RendererProps = Pick<
  HTMLAttributes<HTMLElement>,
  'children' | 'className' | 'lang' | 'dir'
>;

const externalLinkRenderer = ({
  href,
  children,
  lang,
  dir,
}: RendererProps & { href?: string }) =>
  href ? (
    <NativeLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openExternal(href)}
      lang={lang}
      dir={dir}
    >
      {children}
    </NativeLink>
  ) : (
    <>{children}</>
  );

const headingRenderer =
  (level: 'h1' | 'h2' | 'h3' | 'h4') =>
  ({ children, lang, dir }: RendererProps) => (
    <Heading level={level} lang={lang} dir={dir}>
      {children}
    </Heading>
  );

const defaultMarkdownRenderers = {
  a: externalLinkRenderer,
  h1: headingRenderer('h1'),
  h2: headingRenderer('h2'),
  h3: headingRenderer('h3'),
  h4: headingRenderer('h4'),
  h5: headingRenderer('h4'),
  h6: headingRenderer('h4'),
  p: Paragraph,
  ul: ({ children, className, lang, dir }: RendererProps) => (
    <UnorderedList className={className} lang={lang} dir={dir}>
      {children}
    </UnorderedList>
  ),
  ol: ({ children, className, lang, dir }: RendererProps) => (
    <OrderedList className={className} lang={lang} dir={dir}>
      {children}
    </OrderedList>
  ),
} satisfies Components;

/**
 * Gives each element at the top of the rendered markdown the text's `lang` and
 * `dir`. A wrapper could carry them for everything at once, but it would make
 * the blocks children of the wrapper instead of siblings of the content around
 * them, and that sibling order is what the typography's `not-first:` and
 * `not-last:` spacing reads. Text outside any element (only ever left by raw
 * HTML or an unwrapped tag) keeps the surrounding language: naming its own
 * would mean adding exactly that element.
 */
const withLanguage = (markdown: ReactElement, language: LanguageAttributes) =>
  isValidElement<{ children?: ReactNode }>(markdown)
    ? cloneElement(
        markdown,
        undefined,
        Children.map(markdown.props.children, (child) =>
          isValidElement<LanguageAttributes>(child)
            ? cloneElement(child, language)
            : child,
        ),
      )
    : markdown;

type RenderMarkdownProps = Omit<Options, 'children'> & {
  /**
   * The markdown. Text in a named language carries it on what it renders: on
   * `render` when given, otherwise on each top-level element.
   */
  children?: PresentationalText | null;
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
  const language = presentationalTextProps(children);
  const options: Options = {
    allowedElements: allowedElements ?? defaultMarkdownOptions.allowedElements,
    components: {
      ...defaultMarkdownRenderers,
      ...components,
    },
    remarkPlugins: remarkPlugins ?? defaultMarkdownOptions.remarkPlugins,
    rehypePlugins: rehypePlugins ?? defaultMarkdownOptions.rehypePlugins,
    unwrapDisallowed:
      unwrapDisallowed ?? defaultMarkdownOptions.unwrapDisallowed,
    ...props,
    children: children == null ? children : presentationalTextValue(children),
  };

  if (render) {
    return cloneElement(render, language, <ReactMarkdown {...options} />);
  }

  if (language.lang === undefined) {
    return <ReactMarkdown {...options} />;
  }

  // Synchronous like the component, so the top-level elements can be reached
  // before React renders them.
  return withLanguage(ReactMarkdown(options), language);
};

export { getMarkdownLabelText, RenderMarkdown };
