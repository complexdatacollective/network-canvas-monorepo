import {
  AlertTriangle,
  BookOpenText,
  FileImage,
  type LucideIcon,
  Printer,
  Timeline,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'wouter';

import { getHasUnusedAssets, getHasUnusedVariables } from '~/selectors/issues';
import { getProtocolName } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const TABS: Tab[] = [
  { href: '/protocol', label: 'Stages', Icon: Timeline },
  { href: '/protocol/assets', label: 'Resources', Icon: FileImage },
  { href: '/protocol/codebook', label: 'Codebook', Icon: BookOpenText },
  { href: '/protocol/summary', label: 'Summary', Icon: Printer },
];

const ProjectNav = () => {
  const [location] = useLocation();
  const protocolName = useSelector(getProtocolName);
  const hasUnusedAssets = useSelector(getHasUnusedAssets);
  const hasUnusedVariables = useSelector(getHasUnusedVariables);

  // Per-tab warning descriptions, keyed by href. A defined value renders a
  // warning indicator on that tab and provides its screen-reader label.
  const tabWarnings: Record<string, string | undefined> = {
    '/protocol/assets': hasUnusedAssets ? 'has unused resources' : undefined,
    '/protocol/codebook': hasUnusedVariables
      ? 'has unused variables'
      : undefined,
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol' },
  ];

  const tabs = TABS.map(({ href, label, Icon }) => {
    const isActive = location === href;
    const warning = tabWarnings[href];
    return (
      <Link
        key={href}
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cx(
          'relative cursor-pointer text-base leading-none font-semibold text-current no-underline transition-colors',
          !isActive && 'hover:text-action',
        )}
      >
        {isActive && (
          <motion.span
            layoutId="project-nav-active-outline"
            aria-hidden
            className="absolute -inset-x-4 -inset-y-2 rounded-full ring-2 ring-current/30"
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          />
        )}
        <span className="relative inline-flex items-center gap-2">
          <span className="relative inline-flex shrink-0">
            <Icon className="size-4 shrink-0" aria-hidden />
            {warning && (
              <AlertTriangle
                aria-hidden
                className="fill-warning absolute -top-1.5 -right-1.5 size-3 text-white drop-shadow-sm"
              />
            )}
          </span>
          {label}
          {warning && <span className="sr-only"> ({warning})</span>}
        </span>
      </Link>
    );
  });

  return (
    <NavShell
      leading={<Breadcrumb items={breadcrumbItems} />}
      trailing={tabs}
    />
  );
};

export default ProjectNav;
