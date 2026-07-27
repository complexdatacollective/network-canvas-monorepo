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
  if (!show) return <div id={id} className="sr-only" aria-live="polite" />;

  return (
    <div
      id={id}
      data-testid={name ? `${name}-field-error` : undefined}
      className={cx(
        'interview:text-destructive-contrast interview:bg-destructive animate-shake interview:mt-2 interview:px-4 interview:py-2 rounded-sm text-sm leading-snug',
        'text-destructive',
        variant === 'box' &&
          'text-destructive-contrast bg-destructive mt-2 px-4 py-2',
      )}
      key={errors?.join('|')} // Re-render when errors change, to trigger animation
      aria-live="polite"
    >
      {errors?.length === 1 && <Paragraph>{errors[0]}</Paragraph>}
      {errors && errors.length > 1 && (
        <ul className="list-disc space-y-1 pl-5">
          {errors.map((error, index) => (
            <li key={`${error}-${index}`}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
