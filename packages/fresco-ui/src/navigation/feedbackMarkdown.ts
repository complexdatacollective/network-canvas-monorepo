import type { JSONContent } from '@tiptap/react';

const INDENT = '  ';

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

function list(node: JSONContent, depth: number): string {
  const ordered = node.type === 'orderedList';
  const start =
    ordered && typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${start + index}.` : '-';
      const pad = INDENT.repeat(depth);
      const [first, ...rest] = (item.content ?? []).map((child) =>
        block(child, depth + 1),
      );
      const head = `${pad}${marker} ${(first ?? '').replaceAll('\n', `\n${pad}${INDENT}`)}`;
      return [head, ...rest].join('\n');
    })
    .join('\n');
}

function block(node: JSONContent, depth: number): string {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return list(node, depth);
  }
  return inline(node.content);
}

/**
 * The feedback editor's document as plain markdown: paragraphs, bullet and
 * numbered lists, bold and italic. It is read as text in PostHog, so nothing
 * is escaped.
 */
export function feedbackMarkdown(document: JSONContent | undefined): string {
  return (document?.content ?? [])
    .map((node) => block(node, 0))
    .join('\n\n')
    .trim();
}
