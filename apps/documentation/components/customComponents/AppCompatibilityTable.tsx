import { ArrowUp, TriangleAlert } from 'lucide-react';
import { Fragment } from 'react';

import { cn } from '~/lib/utils';

type Status = 'native' | 'migrate' | 'unsupported';

type Row = {
  app: string;
  platform: string;
  /** How this app handles a schema 7 protocol. */
  schema7: Status;
  /** How this app handles a schema 8 protocol. */
  schema8: Status;
};

type Group = {
  label: string;
  schema: number;
  rows: Row[];
};

const GROUPS: Group[] = [
  {
    label: 'Current generation',
    schema: 7,
    rows: [
      {
        app: 'Interviewer 6.6.0',
        platform: 'Desktop & tablet',
        schema7: 'native',
        schema8: 'unsupported',
      },
      {
        app: 'Architect 6.6.0',
        platform: 'Desktop',
        schema7: 'native',
        schema8: 'unsupported',
      },
      {
        app: 'Fresco 3.1.2',
        platform: 'Browser',
        schema7: 'native',
        schema8: 'unsupported',
      },
    ],
  },
  {
    label: 'New generation',
    schema: 8,
    rows: [
      {
        app: 'Interviewer 8.0.0',
        platform: 'Desktop & tablet',
        schema7: 'migrate',
        schema8: 'native',
      },
      {
        app: 'Architect Web',
        platform: 'Browser',
        schema7: 'migrate',
        schema8: 'native',
      },
      {
        app: 'Fresco 4.0.0',
        platform: 'Browser',
        schema7: 'migrate',
        schema8: 'native',
      },
    ],
  },
];

// Brand hues darkened toward `--foreground` so they meet contrast as text in
// both themes (the raw mid-lightness teal/orange read too light on white).
const SUCCESS_TEXT =
  'text-[color-mix(in_oklab,hsl(var(--success))_60%,hsl(var(--foreground)))]';
const WARNING_TEXT =
  'text-[color-mix(in_oklab,hsl(var(--warning))_64%,hsl(var(--foreground)))]';

const StatusCell = ({ status, schema }: { status: Status; schema: number }) => {
  if (status === 'native') {
    return <span className={cn(SUCCESS_TEXT, 'font-semibold')}>Native</span>;
  }

  if (status === 'migrate') {
    return (
      <span
        className={cn(
          WARNING_TEXT,
          'inline-flex items-center gap-1 font-semibold',
        )}
      >
        <ArrowUp className="h-4 w-4 shrink-0" aria-hidden />
        Migrates to {schema}
      </span>
    );
  }

  return <span className="text-foreground/60">Not supported</span>;
};

const AppCompatibilityTable = () => (
  <div className="my-8">
    <h3 className="text-foreground mb-4 text-2xl font-bold">
      App compatibility by schema version
    </h3>

    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">
          Which schema version of protocol each Network Canvas app can open,
          grouped by app generation.
        </caption>
        <colgroup>
          <col className="w-[28%]" />
          <col className="w-[22%]" />
          <col className="w-[25%]" />
          <col className="w-[25%]" />
        </colgroup>
        <thead>
          <tr className="bg-foreground text-background text-left">
            <th scope="col" className="px-4 py-3 font-semibold">
              App
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Platform
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Schema 7 protocols
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Schema 8 protocols
            </th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group.label}>
              <tr className="bg-accent/15">
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="text-foreground/80 px-4 py-2 text-left text-xs font-semibold tracking-wide uppercase"
                >
                  {group.label}
                  <span aria-hidden className="px-1.5 opacity-40">
                    ·
                  </span>
                  Schema {group.schema}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.app}
                  className="border-border/70 odd:bg-muted/20 border-t"
                >
                  <td className="text-foreground px-4 py-3 font-bold">
                    {row.app}
                  </td>
                  <td className="text-foreground/70 px-4 py-3">
                    {row.platform}
                  </td>
                  <td className="px-4 py-3">
                    <StatusCell status={row.schema7} schema={7} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusCell status={row.schema8} schema={8} />
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>

    {/* Footnote */}
    <div className="mt-4 flex items-start gap-2">
      <TriangleAlert
        className={cn(WARNING_TEXT, 'mt-0.5 h-4 w-4 shrink-0')}
        aria-hidden
      />
      <p className="text-foreground/80 text-sm">
        <strong className={cn(WARNING_TEXT, 'font-semibold')}>
          Migration is one-way.
        </strong>{' '}
        Schema 8 apps cannot export or save protocols in schema 7 format. Keep a
        copy of your original protocol file if you need to continue using apps
        from the previous generation.
      </p>
    </div>
  </div>
);

export default AppCompatibilityTable;
