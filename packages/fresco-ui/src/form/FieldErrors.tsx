'use client';

import { useEffect, useRef, useState } from 'react';

import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';

/**
 * Render field errors.
 *
 * If there's a single error, it will be displayed as a paragraph.
 * If there are multiple errors, it will render a list.
 *
 * `variant="box"` opts in to the boxed destructive treatment (used by the
 * `interview:` theme) unconditionally, for hosts that render on a
 * non-interview background that would otherwise leave plain destructive text
 * with poor contrast.
 */
export default function FieldErrors({
  id,
  name,
  errors,
  show,
  variant = 'text',
}: {
  id: string; // Used for aria labels
  name?: string; // Field name for testId
  errors?: string[];
  show: boolean;
  variant?: 'text' | 'box';
}) {
  const liveMessages = show ? (errors ?? []) : [];
  // JSON.stringify, not a plain join: a join delimiter can appear inside a
  // message itself (a protocol author's custom validation text, say), which
  // would let two genuinely different message lists hash to the same string.
  // That's more than a missed animation here — `prev.signature === liveSignature`
  // below would then also skip the content update, leaving stale text on
  // screen — so the signature has to actually disambiguate the content.
  const liveSignature = JSON.stringify(liveMessages);

  // What's actually rendered, kept distinct from the live `errors`/`show`
  // props. Revalidating an already-invalid, already-dirty field discards its
  // stored error and then writes the identical message back within the same
  // keystroke (formStore's `discardFieldErrors` runs synchronously on every
  // value change, ahead of the async revalidation that restores it) — so the
  // live props flicker to "no error" and back on every keystroke even though
  // nothing the user can perceive actually changed. A naively `show`/content-
  // driven remount replays `animate-shake` on every one of those flickers.
  // Showing a NEW message happens immediately; clearing one is deferred to
  // the next macrotask, which is always after that same-tick flicker has
  // resolved (field validation here never does real async I/O — it's a
  // zod `safeParseAsync` over an in-memory value — so it never outlasts one
  // microtask), and cancelled outright if the message comes back before then.
  const [displayed, setDisplayed] = useState(() => ({
    messages: liveMessages,
    signature: liveSignature,
  }));

  // A new/changed message is adopted in THIS render, not from a passive
  // effect a beat later: an effect-only update would commit and paint the
  // previous message first, then re-render with the real one — a stale
  // frame, and a live region that receives the new text later than the
  // commit that supplied it (screen readers only announce what's there when
  // they observe it, so a late arrival reads as late or not at all — the
  // exact failure `aria-live` being unconditionally mounted, above, exists to
  // avoid). Only *hiding* is deferred; see the effect below.
  if (liveMessages.length > 0 && liveSignature !== displayed.signature) {
    setDisplayed({ messages: liveMessages, signature: liveSignature });
  }

  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (hideTimeoutRef.current !== undefined) {
      // A hide scheduled a moment ago (the field was briefly clear mid-
      // revalidation) is moot now that a message is showing again.
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = undefined;
    }

    if (liveMessages.length === 0) {
      hideTimeoutRef.current = setTimeout(() => {
        hideTimeoutRef.current = undefined;
        setDisplayed({ messages: [], signature: '' });
      }, 0);
    }

    return () => {
      if (hideTimeoutRef.current !== undefined) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveMessages is derived from liveSignature in the same render
  }, [liveSignature]);

  const messages = displayed.messages;

  // The live region is ALWAYS mounted, message or not. A screen reader only
  // announces changes to a region it was already observing, so a region that
  // arrives together with its first message — which is what swapping the two
  // differently-keyed elements below used to produce — is announced late or
  // not at all. Only the message inside it comes and goes.
  return (
    <div
      id={id}
      aria-live="polite"
      className={messages.length > 0 ? undefined : 'sr-only'}
    >
      {messages.length > 0 && (
        <div
          data-testid={name ? `${name}-field-error` : undefined}
          className={cx(
            'interview:text-destructive-contrast interview:bg-destructive animate-shake interview:mt-2 interview:px-4 interview:py-2 rounded-sm text-sm leading-snug',
            'text-destructive',
            variant === 'box' &&
              'text-destructive-contrast bg-destructive mt-2 px-4 py-2',
          )}
          key={displayed.signature} // Remount only when the displayed message actually changes
        >
          {messages.length === 1 && <Paragraph>{messages[0]}</Paragraph>}
          {messages.length > 1 && (
            <ul className="list-disc space-y-1 pl-5">
              {messages.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
