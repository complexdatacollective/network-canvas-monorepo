import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { cx } from '~/utils/cva';
const messages = defineMessages({
  breadcrumb: {
    id: 'architect.projectNav.breadcrumb.breadcrumb',
    defaultMessage: 'Breadcrumb',
    description: 'The aria-label text in components / ProjectNav / Breadcrumb.',
  },
});

export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

const labelClasses = 'inline-block text-current truncate max-w-xs';

// `truncate` clips the LOGICAL end of a string and puts the ellipsis there.
// Under the app's inherited LTR base direction, bidi reordering places the
// logical START of an RTL protocol name at the visual right, so the 320px slice
// on screen came from the MIDDLE of the name with the ellipsis on the wrong
// side. `dir="auto"` derives each label's base direction from its own first
// strong character, so an RTL name truncates from its end like an LTR one; the
// `title` exposes the whole value either way.

const Breadcrumb = ({ items }: BreadcrumbProps) => {
  const intl = useAppIntl();
  return (
    <nav
      aria-label={intl.formatMessage(messages.breadcrumb)}
      className="flex min-w-0 flex-1 items-center gap-2.5"
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {index > 0 && (
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-current/40"
            />
          )}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              title={item.label}
              dir="auto"
              className={cx(
                labelClasses,
                'hover:text-action cursor-pointer border-none bg-transparent p-0 transition-colors',
              )}
            >
              {item.label}
            </button>
          ) : (
            <span className={labelClasses} dir="auto" title={item.label}>
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumb;
