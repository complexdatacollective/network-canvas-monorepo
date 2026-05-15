import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';

import { cn } from '~/utils/cn';

export type BreadcrumbItem = {
  label: string;
  onClick?: () => void;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

const labelClasses = 'inline-block text-current truncate max-w-xs';

const Breadcrumb = ({ items }: BreadcrumbProps) => (
  <nav
    aria-label="Breadcrumb"
    className="flex min-w-0 flex-1 items-center gap-(--space-sm)"
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
            className={cn(
              labelClasses,
              'hover:text-action cursor-pointer border-none bg-transparent p-0 transition-colors',
            )}
          >
            {item.label}
          </button>
        ) : (
          <span className={labelClasses}>{item.label}</span>
        )}
      </Fragment>
    ))}
  </nav>
);

export default Breadcrumb;
