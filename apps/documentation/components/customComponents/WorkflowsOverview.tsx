import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import Link from '~/components/Link';

/** A key in the `WorkflowsOverview` messages. */
type MessageKey = string;

type Step = {
  /** The tool used in this phase, e.g. "Architect". Product names are not
   * translated; other tools name a message. */
  tool: { name: string } | { message: MessageKey };
  /** Optional link to the tool's documentation, without the locale. */
  path?: string;
  /** Message describing what happens in this phase. */
  detail: MessageKey;
};

type Workflow = {
  name: MessageKey;
  /** When this workflow is the right fit. */
  summary: MessageKey;
  /** One step per phase, in column order. */
  steps: [Step, Step, Step];
};

const PHASES = [
  { number: 'phase1', label: 'design' },
  { number: 'phase2', label: 'collect' },
  { number: 'phase3', label: 'export' },
] as const satisfies { number: MessageKey; label: MessageKey }[];

const WORKFLOWS: Workflow[] = [
  {
    name: 'desktopOnline',
    summary: 'desktopOnlineSummary',
    steps: [
      { tool: { name: 'Architect' }, detail: 'designDesktop' },
      {
        tool: { name: 'Interviewer' },
        path: '/collect-data/interviewer',
        detail: 'deployCloud',
      },
      { tool: { message: 'cloudService' }, detail: 'uploadCloud' },
    ],
  },
  {
    name: 'desktopOffline',
    summary: 'desktopOfflineSummary',
    steps: [
      { tool: { name: 'Architect' }, detail: 'designDesktop' },
      {
        tool: { name: 'Interviewer' },
        path: '/collect-data/interviewer',
        detail: 'deployUsb',
      },
      { tool: { message: 'usbDrive' }, detail: 'returnUsb' },
    ],
  },
  {
    name: 'web',
    summary: 'webSummary',
    steps: [
      {
        tool: { name: 'Architect' },
        path: '/design-protocols/getting-started',
        detail: 'designWeb',
      },
      {
        tool: { name: 'Fresco' },
        path: '/collect-data/fresco/about',
        detail: 'deployFresco',
      },
      { tool: { message: 'frescoDashboard' }, detail: 'exportFresco' },
    ],
  },
];

// The Fresco API link inside the Fresco export step's description.
const frescoApiLink = (locale: string) => (children: ReactNode) => (
  <Link
    href={{ pathname: `/${locale}/analyze-data/fresco-api` }}
    className="font-medium"
  >
    {children}
  </Link>
);

const StepCell = ({ step, locale }: { step: Step; locale: string }) => {
  const t = useTranslations('WorkflowsOverview');
  const className = 'text-accent text-xs font-semibold tracking-wide uppercase';
  const tool = 'name' in step.tool ? step.tool.name : t(step.tool.message);

  return (
    <td className="px-4 py-3 align-top">
      <div className="flex flex-col gap-1">
        {step.path ? (
          <Link
            href={{ pathname: `/${locale}${step.path}` }}
            className={className}
          >
            {tool}
          </Link>
        ) : (
          <span className={className}>{tool}</span>
        )}
        <span className="text-text/70">
          {t.rich(step.detail, { link: frescoApiLink(locale) })}
        </span>
      </div>
    </td>
  );
};

const WorkflowsOverview = () => {
  const t = useTranslations('WorkflowsOverview');
  const locale = useLocale();

  return (
    <div className="my-8">
      <div className="border-outline overflow-x-auto rounded border">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="bg-text text-background text-start">
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('workflow')}
              </th>
              {PHASES.map((phase) => (
                <th key={phase.number} scope="col" className="px-4 py-3">
                  <span className="block text-xs font-semibold uppercase opacity-70">
                    {t(phase.number)}
                  </span>
                  <span className="font-semibold">{t(phase.label)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORKFLOWS.map((workflow) => (
              <tr
                key={workflow.name}
                className="border-outline/70 border-t odd:bg-current/5"
              >
                <th
                  scope="row"
                  className="px-4 py-3 text-start align-top font-bold"
                >
                  <span className="text-text block">{t(workflow.name)}</span>
                  <span className="text-text/60 mt-1 block text-xs font-normal">
                    {t(workflow.summary)}
                  </span>
                </th>
                {workflow.steps.map((step) => (
                  <StepCell key={step.detail} step={step} locale={locale} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default WorkflowsOverview;
