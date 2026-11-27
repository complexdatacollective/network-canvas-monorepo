'use client';

import {
  type ComponentProps,
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';

import {
  ALLOWED_MARKDOWN_LABEL_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import {
  DYNAMIC_VALUE_MARKER,
  inlineMarkdownText,
} from '@codaco/protocol-validation';

import {
  type DynamicTextPart,
  joinMarkdownParts,
  withoutMarkers,
} from './resolveDynamicText';

/**
 * One value the interview filled into the study's text, tinted with the
 * primary colour so the participant can tell it was filled in for
 * them. The tint is mixed into the colour of the surrounding text, so it
 * stays readable on any background; screen readers read the value as part of
 * the sentence. The value is isolated for bidirectional text, so a
 * right-to-left name in a left-to-right sentence (or the reverse) cannot
 * reorder the words around it.
 */
function DynamicValue({ text }: { text: string }) {
  return (
    <span
      data-dynamic-value=""
      className="text-[color-mix(in_oklab,currentColor_50%,var(--primary))]"
    >
      <bdi>{text}</bdi>
    </span>
  );
}

const partKey = (part: DynamicTextPart, index: number) =>
  typeof part === 'string' ? `text-${index}` : `value-${index}`;

/**
 * A dynamic attribute's version in plain text: its words without markup,
 * shown as the words around it, and each value it shows marked out.
 */
function PlainWording({ parts }: { parts: readonly DynamicTextPart[] }) {
  return <DynamicTextParts parts={inlineMarkdownText(parts)} />;
}

/**
 * Resolved plain text, with each value it shows marked out, and a dynamic
 * attribute's wording shown as the words around it, without its bold or
 * italics, which plain text cannot show.
 */
export function DynamicTextParts({
  parts,
}: {
  parts: readonly DynamicTextPart[];
}) {
  return (
    <>
      {parts.map((part, index) => {
        const key = partKey(part, index);
        if (typeof part === 'string') {
          return <Fragment key={key}>{part}</Fragment>;
        }
        return part.wording === true ? (
          <PlainWording key={key} parts={part.parts} />
        ) : (
          <DynamicValue key={key} text={part.text} />
        );
      })}
    </>
  );
}

const MARKER = DYNAMIC_VALUE_MARKER;
const MARKED_VALUE = new RegExp(`${MARKER}(\\d+)${MARKER}`, 'g');
/**
 * A marked value inside an attribute. Markdown percent-encodes a link
 * destination, so a marker there arrives escaped.
 */
const MARKED_IN_ATTRIBUTE = new RegExp(
  `(?:${MARKER}|%EE%80%80)\\d+(?:${MARKER}|%EE%80%80)|${MARKER}`,
  'gi',
);

/**
 * Text with each marked value taken out, with its index: for text a renderer
 * reads out of the markdown itself rather than out of the rendered elements,
 * such as an image's description. A value is never part of an attribute.
 */
export const withoutMarkedValues = (text: string): string =>
  text.replace(MARKED_IN_ATTRIBUTE, '');

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
 * on the finished structure, so a value can only ever become text: a value
 * that looks like markdown or HTML was never parsed as either.
 */
const rehypeDynamicValues = () => (tree: unknown) => {
  if (isHastNode(tree)) replaceMarkers(tree);
};

/** The values a `DynamicMarkdown` shows, by the index its markers carry. */
const DynamicValuesContext = createContext<
  readonly Exclude<DynamicTextPart, string>[]
>([]);

/**
 * A span in resolved markdown: the value its marker names, or its contents.
 * Declared once rather than built with the values, so a change of value
 * updates the text in place instead of remounting it.
 */
function DynamicValueSpan({
  node,
  children,
}: {
  node?: { properties?: Record<string, unknown> };
  children?: ReactNode;
}) {
  const values = useContext(DynamicValuesContext);
  const index = node?.properties?.[VALUE_INDEX_PROPERTY];
  const value = typeof index === 'string' ? values[Number(index)] : undefined;
  // Any other span is unwrapped, as it was before spans were allowed.
  if (value === undefined) return <>{children}</>;
  // A dynamic attribute's version is markdown of its own, drawn in the value's
  // place, so that its markup and the text's are never read as one.
  return value.wording === true ? (
    <DynamicMarkdown
      parts={value.parts}
      allowedElements={ALLOWED_MARKDOWN_LABEL_TAGS}
      render={<Fragment />}
    />
  ) : (
    <DynamicValue text={value.text} />
  );
}

const DYNAMIC_MARKDOWN_COMPONENTS = { span: DynamicValueSpan };
const DYNAMIC_MARKDOWN_REHYPE_PLUGINS = [rehypeDynamicValues];

type MarkdownOptions = Omit<
  ComponentProps<typeof RenderMarkdown>,
  'children' | 'components' | 'rehypePlugins'
>;

/**
 * Resolved markdown, with each value it shows marked out, and a dynamic
 * attribute's wording shown as the words around it. The message's
 * words are rendered as markdown with each value replaced by a marker; the
 * values go in afterwards, as text.
 */
export function DynamicMarkdown({
  parts,
  allowedElements,
  ...markdownOptions
}: MarkdownOptions & { parts: readonly DynamicTextPart[] }) {
  const { markdown, values } = useMemo(() => {
    const shown: Exclude<DynamicTextPart, string>[] = [];
    const text = joinMarkdownParts(
      parts.map((part) =>
        typeof part === 'string' ? withoutMarkers(part) : part,
      ),
      (part) => {
        shown.push(part);
        return `${MARKER}${shown.length - 1}${MARKER}`;
      },
    );
    return { markdown: text, values: shown };
  }, [parts]);

  return (
    <DynamicValuesContext.Provider value={values}>
      <RenderMarkdown
        {...markdownOptions}
        allowedElements={[
          ...(allowedElements ?? ALLOWED_MARKDOWN_LABEL_TAGS),
          'span',
        ]}
        rehypePlugins={DYNAMIC_MARKDOWN_REHYPE_PLUGINS}
        components={DYNAMIC_MARKDOWN_COMPONENTS}
      >
        {markdown}
      </RenderMarkdown>
    </DynamicValuesContext.Provider>
  );
}
