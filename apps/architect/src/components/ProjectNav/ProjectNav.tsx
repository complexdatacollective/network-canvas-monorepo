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

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useProtocolAccessMode } from '~/hooks/useProtocolAccessMode';
import { type MessageConfig, formatConfig } from '~/i18n/formatConfig';
import {
  getHasUnusedAssets,
  getHasUnusedVariables,
  getHasVariableRoleConflicts,
} from '~/selectors/issues';
import { getProtocolName } from '~/selectors/protocol';
import { cx } from '~/utils/cva';

import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';
const chromeMessages = defineMessages({
  untitledProtocol: {
    id: 'architect.chrome.projectNav.projectNav.untitledProtocol',
    defaultMessage: 'Untitled protocol',
    description: 'The label text in components / ProjectNav / ProjectNav.',
  },
});
const configMessages = defineMessages({
  stages: {
    id: 'architect.projectNav.projectNav.config.stages',
    defaultMessage: 'Stages',
    description:
      'Presentation label or description in components/ProjectNav/ProjectNav.tsx. Identifiers are not translated.',
  },
  resources: {
    id: 'architect.projectNav.projectNav.config.resources',
    defaultMessage: 'Resources',
    description:
      'Presentation label or description in components/ProjectNav/ProjectNav.tsx. Identifiers are not translated.',
  },
  codebook: {
    id: 'architect.projectNav.projectNav.config.codebook',
    defaultMessage: 'Codebook',
    description:
      'Presentation label or description in components/ProjectNav/ProjectNav.tsx. Identifiers are not translated.',
  },
  summary: {
    id: 'architect.projectNav.projectNav.config.summary',
    defaultMessage: 'Summary',
    description:
      'Presentation label or description in components/ProjectNav/ProjectNav.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  warning: {
    id: 'architect.presentation.warning',
    defaultMessage: ' ({warning})',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  readOnly: {
    id: 'architect.projectNav.projectNav.readOnly',
    defaultMessage: 'Read only',
    description: 'Visible text in components / ProjectNav / ProjectNav.',
  },
});
const finalMessages = defineMessages({
  roleWarning: {
    id: 'architect.final.components.ProjectNav.ProjectNav.roleWarning',
    defaultMessage: 'has attributes written both with and without validation',
    description: 'Researcher-facing Architect control or feedback.',
  },
  assetsWarning: {
    id: 'architect.final.components.ProjectNav.ProjectNav.assetsWarning',
    defaultMessage: 'has unused resources',
    description: 'Researcher-facing Architect control or feedback.',
  },
  attributesWarning: {
    id: 'architect.final.components.ProjectNav.ProjectNav.attributesWarning',
    defaultMessage: 'has unused attributes',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

type Tab = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const TABS: MessageConfig<Tab>[] = [
  { href: '/protocol', label: configMessages.stages, Icon: Timeline },
  {
    href: '/protocol/assets',
    label: configMessages.resources,
    Icon: FileImage,
  },
  {
    href: '/protocol/codebook',
    label: configMessages.codebook,
    Icon: BookOpenText,
  },
  { href: '/protocol/summary', label: configMessages.summary, Icon: Printer },
];

const ProjectNav = () => {
  const intl = useAppIntl();
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
      ? intl.formatMessage(finalMessages.roleWarning)
      : undefined,
    '/protocol/assets': hasUnusedAssets
      ? intl.formatMessage(finalMessages.assetsWarning)
      : undefined,
    '/protocol/codebook': hasUnusedVariables
      ? intl.formatMessage(finalMessages.attributesWarning)
      : undefined,
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    {
      label:
        protocolName ?? intl.formatMessage(chromeMessages.untitledProtocol),
    },
  ];

  const tabs = formatConfig(TABS, intl).map(({ href, label, Icon }) => {
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
          {warning && (
            <span className="sr-only">
              {intl.formatMessage(messages.warning, { warning })}
            </span>
          )}
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
        {intl.formatMessage(messages.readOnly)}
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
