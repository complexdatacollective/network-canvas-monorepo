'use client';

import {
  cloneElement,
  type ComponentType,
  type ReactElement,
  Suspense,
  use,
} from 'react';

type MarkdownSource = string | null | undefined;

type MarkdownRenderers = {
  RenderMarkdown: ComponentType<{ children?: MarkdownSource }>;
  FieldLabelMarkdown: ComponentType<{ children?: MarkdownSource }>;
};

let renderers: MarkdownRenderers | undefined;
let loadingRenderers: Promise<MarkdownRenderers> | undefined;

/**
 * Called when the markdown module evaluates. A host that already imports
 * RenderMarkdown (the interview) therefore renders deferred markdown in the
 * same pass, without suspending.
 */
export function registerMarkdownRenderers(loaded: MarkdownRenderers) {
  renderers = loaded;
}

const loadRenderers = () =>
  (loadingRenderers ??= import('./RenderMarkdown').then(() => {
    if (!renderers) throw new Error('Markdown renderers did not register');
    return renderers;
  }));

/**
 * Whether text renders, in every label dialect, as exactly itself: no
 * markdown or HTML syntax, entity, emoji shortcode, autolink, block marker or
 * whitespace the parser would trim or turn into a break.
 */
export const isPlainMarkdownText = (text: string) =>
  !/[\\`*_~[\]<>&:@|#!\n\r\t\0]|www\./i.test(text) &&
  !/^(?:\s|[-+=]|\d+[.)])|\s$/.test(text);

const entities: Record<string, string> = {
  'amp': '&',
  'lt': '<',
  'gt': '>',
  'quot': '"',
  '#39': "'",
};

/**
 * An approximation of the rendered text, for the moment before the renderer
 * arrives: shown transparent, it holds the text's space and gives assistive
 * technology a name without exposing markdown syntax.
 */
const approximateRenderedText = (markdown: string) =>
  markdown
    .replace(/<[^>]*>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*(?:#{1,6}|>|[-+*]|\d+[.)])[ \t]+/gm, '')
    .replace(/(\*{1,3}|_{1,3}|~{1,2}|`+)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .replace(
      /&(amp|lt|gt|quot|#39);/g,
      (entity, name: string) => entities[name] ?? entity,
    );

function LoadedMarkdown({
  renderer,
  children,
}: {
  renderer: keyof MarkdownRenderers;
  children: string;
}) {
  const Renderer = (renderers ?? use(loadRenderers()))[renderer];
  return <Renderer>{children}</Renderer>;
}

function Deferred({
  renderer,
  children,
  render,
}: {
  renderer: keyof MarkdownRenderers;
  children?: MarkdownSource;
  render?: ReactElement;
}) {
  const content =
    !children || isPlainMarkdownText(children) ? (
      children
    ) : (
      <Suspense
        fallback={
          <span className="text-transparent">
            {approximateRenderedText(children)}
          </span>
        }
      >
        <LoadedMarkdown renderer={renderer}>{children}</LoadedMarkdown>
      </Suspense>
    );

  return render ? cloneElement(render, undefined, content) : content;
}

type DeferredMarkdownProps = {
  children?: MarkdownSource;
  render?: ReactElement;
};

/**
 * RenderMarkdown in its default label dialect, loading the markdown parser
 * only for text that needs it. Plain text renders the same DOM directly.
 */
export const DeferredMarkdown = (props: DeferredMarkdownProps) => (
  <Deferred renderer="RenderMarkdown" {...props} />
);

/** FieldLabel's dialect: no GFM, and lists keep their native styling. */
export const DeferredFieldLabelMarkdown = (props: DeferredMarkdownProps) => (
  <Deferred renderer="FieldLabelMarkdown" {...props} />
);
