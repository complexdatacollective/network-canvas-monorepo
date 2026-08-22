import {
  AlertTriangle,
  BookOpenText,
  Eye,
  FileImage,
  type LucideIcon,
  Printer,
  Timeline,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'wouter';

import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import {
  getHasUnusedAssets,
  getHasUnusedVariables,
  getHasVariableRoleConflicts,
} from '~/selectors/issues';
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
  const accessMode = useProtocolAccessMode();
  const protocolName = useSelector(getProtocolName);
  const hasUnusedAssets = useSelector(getHasUnusedAssets);
  const hasUnusedVariables = useSelector(getHasUnusedVariables);
  const hasVariableRoleConflicts = useSelector(getHasVariableRoleConflicts);

  // Per-tab warning descriptions, keyed by href. A defined value renders a
  // warning indicator on that tab and provides its screen-reader label.
  const tabWarnings: Record<string, string | undefined> = {
    '/protocol': hasVariableRoleConflicts
      ? 'has attributes written both with and without validation'
      : undefined,
    '/protocol/assets': hasUnusedAssets ? 'has unused resources' : undefined,
    '/protocol/codebook': hasUnusedVariables
      ? 'has unused attributes'
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

  // A read-only tab renders one whole-protocol view at whatever /protocol URL
  // it is on, so these tabs would push history entries and change nothing. A
  // control that is visibly live and does nothing is the defect this guard was
  // written to remove, so they are replaced by a statement of the state.
  const trailing =
    accessMode === 'read-only' ? (
      <span className="inline-flex items-center gap-2 text-base leading-none font-semibold">
        <Eye className="size-4 shrink-0" aria-hidden />
        Read only
      </span>
    ) : (
      tabs
    );

  return (
    <NavShell
      leading={<Breadcrumb items={breadcrumbItems} />}
      trailing={trailing}
    />
  );
};

export default ProjectNav;
