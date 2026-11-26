import type { JSONContent } from '@tiptap/react';

function inline(nodes: readonly JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      const text = node.text ?? '';
      if (text.trim() === '') return text;
      const marks = new Set((node.marks ?? []).map((mark) => mark.type));
      const lead = text.match(/^\s*/)?.[0] ?? '';
      const trail = text.match(/\s*$/)?.[0] ?? '';
      let core = text.trim();
      if (marks.has('italic')) core = `_${core}_`;
      if (marks.has('bold')) core = `**${core}**`;
      return `${lead}${core}${trail}`;
    })
    .join('');
}

const isList = (node: JSONContent) =>
  node.type === 'bulletList' || node.type === 'orderedList';

function list(node: JSONContent, indent: string): string {
  const ordered = node.type === 'orderedList';
  const start =
    ordered && typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${start + index}.` : '-';
      // A line belongs to the item only when it is indented past the item's
      // marker, which is wider for a number than for a bullet.
      const inner = indent + ' '.repeat(marker.length + 1);
      const [first, ...rest] = item.content ?? [];
      const head = `${indent}${marker} ${first ? block(first, inner).slice(inner.length) : ''}`;
      return [
        head,
        ...rest.map((child) =>
          // A second paragraph in the item needs a blank line before it, or
          // it runs on into the one above.
          isList(child) ? block(child, inner) : `\n${block(child, inner)}`,
        ),
      ].join('\n');
    })
    .join('\n');
}

/** A block of the document, every line of it indented by `indent`. */
function block(node: JSONContent, indent: string): string {
  if (isList(node)) return list(node, indent);
  return `${indent}${inline(node.content).replaceAll('\n', `\n${indent}`)}`;
}

/**
 * The feedback editor's document as plain markdown: paragraphs, bullet and
 * numbered lists, bold and italic. It is read as text in PostHog, so nothing
 * is escaped.
 */
export function feedbackMarkdown(document: JSONContent | undefined): string {
  return (document?.content ?? [])
    .map((node) => block(node, ''))
    .join('\n\n')
    .trim();
}
