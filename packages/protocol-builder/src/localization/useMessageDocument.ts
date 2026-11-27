import { useMemo, useState } from 'react';

import { isRecord } from '@codaco/shared-consts';

import type { RichTextContent } from '../markdown/markdownAdapter.ts';
import { MessageDocumentProblem } from './messageDocument.ts';

type MessageDocumentInputs = Readonly<{
  /**
   * The stored text that the editor shows: a message or markdown, `''` for
   * none.
   */
  text: string;
  /**
   * Everything besides `text` that decides the document `text` opens as,
   * such as its format or the language of its labels. A change opens `text`
   * again.
   */
  openKey: string;
  /**
   * The document that `text` opens as. A `MessageDocumentProblem` that it
   * throws is returned as `problem`.
   */
  open: (text: string) => RichTextContent;
  /**
   * The text that `document` writes, or undefined for none. It throws where
   * the document cannot be written, and the change is then ignored. Called
   * once for each change of the document.
   */
  write: (document: RichTextContent) => string | undefined;
  /**
   * Whether `written` is what the field already holds, so that writing it
   * would change nothing, given the document that `text` opens as. By
   * default, whether it is `text`.
   */
  holds?: (written: string | undefined, opened: RichTextContent) => boolean;
  /** Writes the text, unless the field already holds it (`holds`). */
  onWrite: (written: string | undefined) => void;
}>;

type MessageDocument = Readonly<{
  /**
   * The document that the editor is given; undefined where `text` cannot be
   * opened.
   */
  content: RichTextContent | undefined;
  /** Why `text` cannot be opened, if it cannot. */
  problem: MessageDocumentProblem | undefined;
  /** The editor's `onChange`. */
  onDocumentChange: (next: unknown) => void;
}>;

/** The document that the editor last wrote, and the text it wrote. */
type Written = Readonly<{
  text: string;
  openKey: string;
  content: RichTextContent;
}>;

/**
 * The document that an editor of stored text is given, and what its changes
 * write. While the editor's own last document still writes the stored text,
 * the editor gets that document back rather than the stored text opened
 * again, so that a round trip never rewrites what the researcher is typing.
 *
 * The editor's document can contain structure that the stored text cannot,
 * such as the empty paragraph left by pressing Enter twice to leave a list.
 * Opening the stored text again drops it, and the editor applies the
 * document that it is given as soon as it loses focus: the text would lose a
 * line, and the click that caused the blur would land on whatever moved under
 * the pointer. A text that did not come from this editor (a write made
 * elsewhere, another language) does not match, and is opened as usual.
 *
 * The last document is kept as state, not in a ref, so that a change which
 * writes nothing new still draws the field again with the editor's own
 * document: otherwise the editor would apply the older document when it
 * loses focus.
 */
export function useMessageDocument({
  text,
  openKey,
  open,
  write,
  holds,
  onWrite,
}: MessageDocumentInputs): MessageDocument {
  const opened = useMemo(() => {
    try {
      return open(text);
    } catch (error) {
      if (error instanceof MessageDocumentProblem) return error;
      throw error;
    }
    // The text and `openKey` decide the document; `open` is a new function
    // on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [text, openKey]);
  const [written, setWritten] = useState<Written | null>(null);

  if (opened instanceof MessageDocumentProblem) {
    return { content: undefined, problem: opened, onDocumentChange: () => {} };
  }

  const content =
    written !== null && written.text === text && written.openKey === openKey
      ? written.content
      : opened;

  const onDocumentChange = (next: unknown) => {
    if (!isRecord(next)) return;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- what the editor emits is its document
    const document = next as RichTextContent;
    let nextText: string | undefined;
    try {
      nextText = write(document);
    } catch {
      return;
    }
    setWritten({ text: nextText ?? '', openKey, content: document });
    const unchanged =
      holds === undefined ? (nextText ?? '') === text : holds(nextText, opened);
    if (!unchanged) onWrite(nextText);
  };

  return { content, problem: undefined, onDocumentChange };
}
