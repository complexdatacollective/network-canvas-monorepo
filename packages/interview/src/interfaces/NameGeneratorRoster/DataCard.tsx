'use client';

import type { IntlShape } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { VariableValue } from '@codaco/shared-consts';

import { type ContentFormat } from '../../localization/contentFormat';
import { useContentFormat } from '../../localization/useContentFormat';
import { interfaceMessages } from '../messages';

export type DataCardDetail = {
  id: string;
  label: string;
  value: VariableValue | undefined;
};

type DataCardProps = Omit<
  React.ComponentPropsWithRef<'article'>,
  'aria-label'
> & {
  /** The card title — derived from the node's name heuristic or fallback */
  label: string;
  /** Label and value pairs to render below the title, in order */
  details?: readonly DataCardDetail[];
};

/**
 * A roster value as text for the participant. Words (yes, no, an empty value)
 * are in the interface language; numbers, coordinates and lists follow the
 * protocol language, since they sit among the protocol's own text.
 */
const formatValue = (
  value: VariableValue | undefined,
  intl: IntlShape,
  format: ContentFormat,
): string => {
  const empty = () => intl.formatMessage(interfaceMessages.emptyValue);

  if (value === null || value === undefined || value === '') return empty();

  if (typeof value === 'boolean')
    return intl.formatMessage(
      value ? interfaceMessages.yes : interfaceMessages.no,
    );

  if (typeof value === 'number') return format.formatNumber(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return empty();
    return format.formatList(
      value.map((item) => formatValue(item, intl, format)),
    );
  }

  if (
    typeof value === 'object' &&
    'x' in value &&
    'y' in value &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  ) {
    return format.formatList([
      format.formatCoordinate(value.y),
      format.formatCoordinate(value.x),
    ]);
  }

  if (typeof value === 'object') {
    return format.formatList(
      Object.entries(value).map(
        ([k, v]) =>
          `${k}: ${typeof v === 'number' ? format.formatNumber(v) : String(v)}`,
      ),
    );
  }

  return value;
};

/**
 * DataCard renders a roster item with a prominent title and a tabular
 * (description-list) layout of additional properties. Renders correctly in
 * either a list or a grid layout — the card stretches to fill its container
 * and the description list reflows naturally at any width.
 *
 * Uses semantic `<dl>`/`<dt>`/`<dd>` elements so screen readers can announce
 * each property as a label/value pair instead of a flat run of text.
 */
const DataCard = ({
  label,
  details,
  className,
  ...articleProps
}: DataCardProps) => {
  const intl = useAppIntl();
  const format = useContentFormat();
  const hasDetails = details && details.length > 0;

  return (
    <article
      {...articleProps}
      className={cx(
        // oxlint-disable-next-line tailwindcss/no-unknown-classes -- NameGeneratorRoster's drag-cursor selector hook
        'card group relative flex h-full flex-col overflow-hidden rounded',
        'bg-platinum text-charcoal',
        'focusable outline-white',
        className,
      )}
      aria-label={label}
    >
      <header className="border-platinum-dark/30 border-b px-6 py-4">
        <Heading level="label" margin="none">
          {label}
        </Heading>
      </header>

      {hasDetails && (
        <dl className="bg-platinum-dark grid grow grid-cols-[fit-content(33%)_minmax(0,1fr)] items-baseline gap-x-6 gap-y-4 px-6 py-2">
          {details.map(({ id, label: detailLabel, value }) => (
            <div key={id} className="contents">
              <Heading
                level="label"
                variant="all-caps"
                margin="none"
                render={<dt />}
                className="text-right text-xs leading-tight font-extrabold wrap-break-word"
              >
                {detailLabel}
              </Heading>
              <dd className="text-sm leading-tight font-medium wrap-break-word">
                {formatValue(value, intl, format)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
};

export default DataCard;
