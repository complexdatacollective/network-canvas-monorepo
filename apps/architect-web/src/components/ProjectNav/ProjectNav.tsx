import {
  BookOpenText,
  FileImage,
  type LucideIcon,
  Printer,
  Timeline,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useSelector } from 'react-redux';
import { Link, useLocation } from 'wouter';

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

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol' },
  ];

  const tabs = (
    <nav
      aria-label="Project sections"
      className="flex items-center gap-(--space-lg) lg:gap-(--space-xl)"
    >
      {TABS.map(({ href, label, Icon }) => {
        const isActive = location === href;
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
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <NavShell
      leading={<Breadcrumb items={breadcrumbItems} />}
      trailing={tabs}
    />
  );
};

export default ProjectNav;
