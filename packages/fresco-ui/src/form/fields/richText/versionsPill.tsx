'use client';

import { Braces } from 'lucide-react';

import {
  type PresentationalText,
  presentationalTextValue,
} from '../../../PresentationalText';
import { cx } from '../../../utils/cva';

/** The classes of the pill a folded set of versions is drawn as. */
export const versionsPillClasses = (className?: string) =>
  cx(
    // A long label wraps like the words around it, each line drawn as the
    // pill, so a narrow column or table cell is never pushed wider.
    'mx-0.5 rounded-full border box-decoration-clone px-2 py-px',
    // The name in bold body type, whatever the text around it is set in.
    'font-body font-bold data-selected:outline-2 [&.ProseMirror-selectednode]:outline-2',
    'border-primary/40 bg-primary/10 data-selected:outline-primary [&.ProseMirror-selectednode]:outline-primary',
    className,
  );

/** A label split after its first word: `['partner', ' of (x)']`. */
const splitFirstWord = (label: string): readonly [string, string] => {
  const first = /^\s*\S*/.exec(label)?.[0] ?? '';
  return [first, label.slice(first.length)];
};

/**
 * A pill's contents: the icon and the label's first word held together, so
 * the icon is never left at the end of one line while the label starts on
 * the next, then the rest of the label.
 */
export const VersionsPillContent = ({
  label,
}: {
  label: PresentationalText;
}) => {
  const [first, rest] = splitFirstWord(presentationalTextValue(label));
  return (
    <>
      <span className="whitespace-nowrap">
        <Braces
          aria-hidden
          className="me-1 inline-block size-[1em] align-[-0.125em] opacity-70"
        />
        {first}
      </span>
      {rest}
    </>
  );
};
