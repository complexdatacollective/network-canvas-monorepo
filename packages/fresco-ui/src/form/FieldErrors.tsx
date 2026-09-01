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
  const messages = show ? (errors ?? []) : [];

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
          key={messages.join('|')} // Remount when errors change, to trigger animation
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
