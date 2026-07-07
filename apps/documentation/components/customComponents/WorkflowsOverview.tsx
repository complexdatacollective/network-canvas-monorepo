import type { Route } from 'next';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

type Step = {
  /** The tool used in this phase, e.g. "Architect". */
  tool: string;
  /** Optional internal link to the tool's documentation. */
  href?: string;
  /** One-line description of what happens in this phase. */
  detail: ReactNode;
};

const DocLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <NextLink
    href={href as Route}
    className="text-link focusable font-medium hover:underline hover:underline-offset-2"
  >
    {children}
  </NextLink>
);

type Workflow = {
  name: string;
  /** When this workflow is the right fit. */
  summary: string;
  /** One step per phase, in column order. */
  steps: [Step, Step, Step];
};

const PHASES = [
  { number: 'Phase 1', label: 'Design a protocol' },
  { number: 'Phase 2', label: 'Collect data' },
  { number: 'Phase 3', label: 'Export data' },
] as const;

const WORKFLOWS: Workflow[] = [
  {
    name: 'Desktop, online',
    summary: 'In-person interviews on internet-connected devices.',
    steps: [
      {
        tool: 'Architect',
        detail:
          'Design a protocol in Architect for Interviewer (new studies); Architect Classic for Interviewer Classic.',
      },
      {
        tool: 'Interviewer',
        href: '/en/collect-data/interviewer',
        detail: 'Deploy to each device via a cloud file service.',
      },
      {
        tool: 'Cloud service',
        detail: 'Upload exports to the same cloud service to consolidate them.',
      },
    ],
  },
  {
    name: 'Desktop, offline',
    summary: 'The same desktop flow when devices have no internet.',
    steps: [
      {
        tool: 'Architect',
        detail:
          'Design a protocol in Architect for Interviewer (new studies); Architect Classic for Interviewer Classic.',
      },
      {
        tool: 'Interviewer',
        href: '/en/collect-data/interviewer',
        detail: 'Carry the protocol to devices on a USB drive.',
      },
      { tool: 'USB drive', detail: 'Move collected data back off via USB.' },
    ],
  },
  {
    name: 'Web-based',
    summary: 'Remote interviews completed in the browser.',
    steps: [
      {
        tool: 'Architect',
        href: '/en/design-protocols/getting-started',
        detail: 'Design the protocol in the browser.',
      },
      {
        tool: 'Fresco',
        href: '/en/collect-data/fresco/about',
        detail: 'Upload once; participants interview in their browser.',
      },
      {
        tool: 'Fresco dashboard',
        detail: (
          <>
            Manage centrally; export from the dashboard or pull via the{' '}
            <DocLink href="/en/analyze-data/fresco-api">Fresco API</DocLink>.
          </>
        ),
      },
    ],
  },
];

const ToolLabel = ({ tool, href }: Pick<Step, 'tool' | 'href'>) => {
  const className = 'text-accent text-xs font-semibold tracking-wide uppercase';

  if (href) {
    return (
      <NextLink
        href={href as Route}
        className={cn(
          className,
          'focusable hover:underline hover:underline-offset-2',
        )}
      >
        {tool}
      </NextLink>
    );
  }

  return <span className={className}>{tool}</span>;
};

const StepCell = ({ step }: { step: Step }) => (
  <td className="px-4 py-3 align-top">
    <div className="flex flex-col gap-1">
      <ToolLabel tool={step.tool} href={step.href} />
      <span className="text-foreground/70">{step.detail}</span>
    </div>
  </td>
);

const WorkflowsOverview = () => (
  <div className="my-8">
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[44rem] border-collapse text-sm">
        <caption className="sr-only">
          The three ways to run a Network Canvas study, across the design,
          collect, and export phases.
        </caption>
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[26%]" />
          <col className="w-[26%]" />
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr className="bg-foreground text-background text-left">
            <th scope="col" className="px-4 py-3 font-semibold">
              Workflow
            </th>
            {PHASES.map((phase) => (
              <th key={phase.number} scope="col" className="px-4 py-3">
                <span className="block text-xs font-semibold uppercase opacity-70">
                  {phase.number}
                </span>
                <span className="font-semibold">{phase.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WORKFLOWS.map((workflow) => (
            <tr
              key={workflow.name}
              className="border-border/70 odd:bg-muted/20 border-t"
            >
              <th
                scope="row"
                className="px-4 py-3 text-left align-top font-bold"
              >
                <span className="text-foreground block">{workflow.name}</span>
                <span className="text-foreground/60 mt-1 block text-xs font-normal">
                  {workflow.summary}
                </span>
              </th>
              {workflow.steps.map((step) => (
                <StepCell key={step.tool} step={step} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default WorkflowsOverview;
