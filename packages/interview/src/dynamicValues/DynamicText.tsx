'use client';

import { type ComponentProps, Fragment, type ReactNode, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  ALLOWED_MARKDOWN_LABEL_TAGS,
  DEFAULT_MARKDOWN_REHYPE_PLUGINS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import { DYNAMIC_VALUE_MARKER } from '@codaco/protocol-validation';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { type DynamicTextPart, joinMarkdownParts } from './resolveDynamicText';

/**
 * One value the interview filled into the study's text, in a very subtle
 * tint of the accent colour so the participant can tell it was filled in for
 * them. The tint is mixed into the colour of the surrounding text, so it
 * stays readable on any background.
 * Screen readers hear "Dynamic value: …" instead of the bare value. The
 * value is isolated for bidirectional text, so a right-to-left name in a
 * left-to-right sentence (or the reverse) cannot reorder the words around it.
 */
function DynamicValue({ text }: { text: string }) {
  const intl = useAppIntl();
  return (
    <span
      data-dynamic-value=""
      className="text-[color-mix(in_oklab,currentColor_75%,var(--accent))]"
    >
      <bdi aria-hidden="true">{text}</bdi>
      <span className="sr-only">
        {intl.formatMessage(runtimeMessages.dynamicValue, { value: text })}
      </span>
    </span>
  );
}

const partKey = (part: DynamicTextPart, index: number) =>
  typeof part === 'string' ? `text-${index}` : `value-${index}`;

/** Resolved plain text, with each value it shows marked out. */
export function DynamicTextParts({
  parts,
}: {
  parts: readonly DynamicTextPart[];
}) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <Fragment key={partKey(part, index)}>{part}</Fragment>
        ) : (
          <DynamicValue key={partKey(part, index)} text={part.text} />
        ),
      )}
    </>
  );
}

const MARKER = DYNAMIC_VALUE_MARKER;
const MARKED_VALUE = new RegExp(`${MARKER}(\\d+)${MARKER}`, 'g');
const ANY_MARKER = new RegExp(MARKER, 'g');
/**
 * A marked value inside an attribute, with the empty comments that
 * `joinMarkdownParts` may set around it. Markdown percent-encodes a link
 * destination, so a marker or comment there arrives escaped.
 */
const BOUNDARY_IN_ATTRIBUTE = '(?:<!---->|%3C!----%3E)*';
const MARKED_IN_ATTRIBUTE = new RegExp(
  `${BOUNDARY_IN_ATTRIBUTE}(?:${MARKER}|%EE%80%80)\\d+(?:${MARKER}|%EE%80%80)${BOUNDARY_IN_ATTRIBUTE}|${MARKER}`,
  'gi',
);
/** Set on the element that stands for a value, to its index. */
const VALUE_INDEX_PROPERTY = 'dataDynamicValueIndex';

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const isHastNode = (node: unknown): node is HastNode =>
  typeof node === 'object' &&
  node !== null &&
  typeof (node as { type?: unknown }).type === 'string';

const splitText = (text: string): HastNode[] => {
  const nodes: HastNode[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKED_VALUE)) {
    if (match.index > last) {
      nodes.push({ type: 'text', value: text.slice(last, match.index) });
    }
    nodes.push({
      type: 'element',
      tagName: 'span',
      properties: { [VALUE_INDEX_PROPERTY]: match[1] },
      children: [],
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push({ type: 'text', value: text.slice(last) });
  return nodes;
};

const replaceMarkers = (node: HastNode) => {
  // A value is never part of an attribute: not a link's destination, not an
  // image's source or text. A marker that reached one is dropped.
  for (const [key, property] of Object.entries(node.properties ?? {})) {
    if (typeof property === 'string' && node.properties) {
      node.properties[key] = property.replace(MARKED_IN_ATTRIBUTE, '');
    }
  }
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value?.includes(MARKER)) {
      return splitText(child.value);
    }
    replaceMarkers(child);
    return [child];
  });
};

/**
 * Replaces each value's marker with an empty element standing for it. Runs
 * after sanitizing, on the finished structure, so a value can only ever
 * become text: a value that looks like markdown or HTML was never parsed as
 * either.
 */
const rehypeDynamicValues = () => (tree: unknown) => {
  if (isHastNode(tree)) replaceMarkers(tree);
};

type MarkdownOptions = Omit<
  ComponentProps<typeof RenderMarkdown>,
  'children' | 'components' | 'rehypePlugins'
>;

/**
 * Resolved markdown, with each value it shows marked out. The message's
 * words are rendered as markdown with each value replaced by a marker; the
 * values go in afterwards, as text.
 */
export function DynamicMarkdown({
  parts,
  allowedElements,
  ...markdownOptions
}: MarkdownOptions & { parts: readonly DynamicTextPart[] }) {
  const { markdown, values } = useMemo(() => {
    const shown: string[] = [];
    const text = joinMarkdownParts(
      parts.map((part) =>
        typeof part === 'string' ? part.replace(ANY_MARKER, '') : part,
      ),
      (part) => {
        shown.push(part.text);
        return `${MARKER}${shown.length - 1}${MARKER}`;
      },
    );
    return { markdown: text, values: shown };
  }, [parts]);

  const components = useMemo(
    () => ({
      span: ({
        node,
        children,
      }: {
        node?: { properties?: Record<string, unknown> };
        children?: ReactNode;
      }) => {
        const index = node?.properties?.[VALUE_INDEX_PROPERTY];
        const value =
          typeof index === 'string' ? values[Number(index)] : undefined;
        // Any other span is unwrapped, as it was before spans were allowed.
        return value === undefined ? (
          <>{children}</>
        ) : (
          <DynamicValue text={value} />
        );
      },
    }),
    [values],
  );

  return (
    <RenderMarkdown
      {...markdownOptions}
      allowedElements={[
        ...(allowedElements ?? ALLOWED_MARKDOWN_LABEL_TAGS),
        'span',
      ]}
      rehypePlugins={[...DEFAULT_MARKDOWN_REHYPE_PLUGINS, rehypeDynamicValues]}
      components={components}
    >
      {markdown}
    </RenderMarkdown>
  );
}
