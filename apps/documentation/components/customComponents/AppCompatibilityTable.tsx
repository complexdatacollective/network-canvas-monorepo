import { ArrowUp, TriangleAlert } from 'lucide-react';
import { Fragment } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import { cx } from '@codaco/fresco-ui/utils/cva';

/**
 * - `native`: opened and run (or edited) as it is.
 * - `migrate`: migrated automatically to the group's schema on import.
 * - `keepOrUpgrade`: edited as schema 8, or upgraded to schema 9 as a copy,
 *   whichever the researcher chooses.
 * - `unsupported`: refused.
 */
type Status = 'native' | 'migrate' | 'keepOrUpgrade' | 'unsupported';

type Row = {
  app: string;
  platform: string;
  /** How this app handles a schema 7 protocol. */
  schema7: Status;
  /** How this app handles a schema 8 protocol. */
  schema8: Status;
  /** How this app handles a schema 9 protocol. */
  schema9: Status;
};

type Group = {
  label: string;
  schema: number;
  /** The schema an automatic migration (`migrate`) brings a protocol to. */
  migratesTo: number;
  rows: Row[];
};

const GROUPS: Group[] = [
  {
    label: 'Previous generation',
    schema: 7,
    migratesTo: 7,
    rows: [
      {
        app: 'Interviewer Classic 6.x.x',
        platform: 'Desktop & tablet',
        schema7: 'native',
        schema8: 'unsupported',
        schema9: 'unsupported',
      },
      {
        app: 'Architect Classic 6.x.x',
        platform: 'Desktop',
        schema7: 'native',
        schema8: 'unsupported',
        schema9: 'unsupported',
      },
      {
        app: 'Fresco 3.x.x',
        platform: 'Browser',
        schema7: 'native',
        schema8: 'unsupported',
        schema9: 'unsupported',
      },
    ],
  },
  {
    label: 'Current generation',
    schema: 9,
    migratesTo: 8,
    rows: [
      {
        app: 'Interviewer 9.x.x',
        platform: 'Desktop & tablet',
        schema7: 'migrate',
        schema8: 'native',
        schema9: 'native',
      },
      {
        app: 'Architect 9.x.x',
        platform: 'Browser',
        schema7: 'keepOrUpgrade',
        schema8: 'keepOrUpgrade',
        schema9: 'native',
      },
      {
        app: 'Fresco 5.x.x',
        platform: 'Browser',
        schema7: 'migrate',
        schema8: 'native',
        schema9: 'native',
      },
    ],
  },
];

// Brand hues darkened toward `--text` so they meet contrast as text in
// both themes (the raw mid-lightness teal/orange read too light on white).
const SUCCESS_TEXT =
  'text-[color-mix(in_oklab,var(--success)_60%,var(--text))]';
const WARNING_TEXT =
  'text-[color-mix(in_oklab,var(--warning)_64%,var(--text))]';

const StatusCell = ({
  status,
  targetSchema,
}: {
  status: Status;
  targetSchema: number;
}) => {
  if (status === 'native') {
    return <span className={cx(SUCCESS_TEXT, 'font-semibold')}>Native</span>;
  }

  if (status === 'migrate') {
    return (
      <span
        className={cx(
          WARNING_TEXT,
          'inline-flex items-center gap-1 font-semibold',
        )}
      >
        <ArrowUp className="h-4 w-4 shrink-0" aria-hidden />
        Migrates to {targetSchema}
      </span>
    );
  }

  if (status === 'keepOrUpgrade') {
    return (
      <span className={cx(SUCCESS_TEXT, 'font-semibold')}>
        Edits as 8, or upgrades to 9
      </span>
    );
  }

  return <span className="text-text/60">Not supported</span>;
};

const AppCompatibilityTable = () => (
  <div className="my-8">
    <h3 className="text-text mb-4 text-2xl font-bold">
      App compatibility by schema version
    </h3>

    <Table>
      <caption className="sr-only">
        Which schema version of protocol each Network Canvas app can open,
        grouped by app generation.
      </caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">App</TableHead>
          <TableHead scope="col">Platform</TableHead>
          <TableHead scope="col">Schema 7 protocols</TableHead>
          <TableHead scope="col">Schema 8 protocols</TableHead>
          <TableHead scope="col">Schema 9 protocols</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {GROUPS.map((group) => (
          <Fragment key={group.label}>
            <TableRow className="bg-accent/15">
              <TableHead
                scope="colgroup"
                colSpan={5}
                className="text-text/80 text-xs font-semibold tracking-wide uppercase"
              >
                {group.label}
                <span aria-hidden className="px-1.5 opacity-40">
                  ·
                </span>
                Schema {group.schema}
              </TableHead>
            </TableRow>
            {group.rows.map((row) => (
              <TableRow key={row.app}>
                <TableCell className="text-text font-bold">{row.app}</TableCell>
                <TableCell className="text-text/70">{row.platform}</TableCell>
                <TableCell>
                  <StatusCell
                    status={row.schema7}
                    targetSchema={group.migratesTo}
                  />
                </TableCell>
                <TableCell>
                  <StatusCell
                    status={row.schema8}
                    targetSchema={group.migratesTo}
                  />
                </TableCell>
                <TableCell>
                  <StatusCell
                    status={row.schema9}
                    targetSchema={group.migratesTo}
                  />
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>

    {/* Footnote */}
    <div className="mt-4 flex items-start gap-2">
      <TriangleAlert
        className={cx(WARNING_TEXT, 'mt-0.5 h-4 w-4 shrink-0')}
        aria-hidden
      />
      <p className="text-text/80 text-sm">
        <strong className={cx(WARNING_TEXT, 'font-semibold')}>
          Upgrading is one-way.
        </strong>{' '}
        Only Architect upgrades a protocol to schema 9, and only when you choose
        to; it makes an upgraded copy and leaves the original unchanged. No app
        can convert a protocol back to an older schema version, so keep a copy
        of your original protocol file if you need to continue using apps that
        only support an older schema. Releases of Interviewer and Fresco made
        before schema 9 open schema 7 and 8 protocols only, so update them
        before you use a schema 9 protocol.
      </p>
    </div>
  </div>
);

export default AppCompatibilityTable;
