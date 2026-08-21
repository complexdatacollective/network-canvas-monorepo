import { Fragment } from 'react';
import { Link } from 'wouter';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  STAGE_SECTION_SYNTHETIC,
  stageSectionHref,
} from '~/components/StageEditor/deepLink';

import { ParameterValue } from './ParameterValue';
import type { SyntheticStageRow } from './stageRows';
import { conflictKey, SyntheticConflictAlert } from './SyntheticConflictAlert';

/**
 * The stage table (spec, Surfaces §4): one row per stage in timeline order,
 * every resolved parameter with its authored/default badge, panels beneath the
 * stage that owns them, and the conflicts that stage owns beneath both.
 *
 * Read-only by construction — the only interactive element in it is the link
 * to the stage's own editor, which is where every one of these values is
 * changed. `Table` supplies its own horizontally scrolling container, so a wide
 * protocol scrolls the table and never the page.
 */

const STAGE_HEADER = 'Stage';
const INTERFACE_HEADER = 'Interface';
const COUNT_HEADER = 'Node count';
const TOPOLOGY_HEADER = 'Edge topology';
const BURDEN_HEADER = 'Response burden';
const PANEL_HEADER = 'Nomination probability';
const EMPTY_MESSAGE = 'This protocol has no stages yet.';
const PANEL_ROW_LABEL = 'Panel';

export type SyntheticStageTableProps = {
  rows: readonly SyntheticStageRow[];
  /** The heading that names this table for assistive technology. */
  labelledBy: string;
};

export function SyntheticStageTable({
  rows,
  labelledBy,
}: SyntheticStageTableProps) {
  if (rows.length === 0) {
    return <Paragraph className="text-muted">{EMPTY_MESSAGE}</Paragraph>;
  }

  // The panel column is added only where a panel exists to fill it: a column of
  // dashes in every protocol without panels is noise in a table that is already
  // wide.
  const hasPanels = rows.some((row) => row.panels.length > 0);
  const columnCount = hasPanels ? 6 : 5;

  return (
    <Table aria-labelledby={labelledBy}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{STAGE_HEADER}</TableHead>
          <TableHead scope="col">{INTERFACE_HEADER}</TableHead>
          <TableHead scope="col">{COUNT_HEADER}</TableHead>
          <TableHead scope="col">{TOPOLOGY_HEADER}</TableHead>
          <TableHead scope="col">{BURDEN_HEADER}</TableHead>
          {hasPanels && <TableHead scope="col">{PANEL_HEADER}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <TableRow>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span className="text-muted tabular-nums">
                    {row.position}
                  </span>
                  <NativeLink
                    // The visible label opens the accessible name (WCAG
                    // "Label in Name"), with the destination after it so a
                    // reader listing every link on the page can tell these
                    // apart from the Codebook links below.
                    aria-label={`${row.label} — open this stage's synthetic data section`}
                    render={
                      <Link
                        href={stageSectionHref(row.id, STAGE_SECTION_SYNTHETIC)}
                      />
                    }
                  >
                    {row.label}
                  </NativeLink>
                </span>
              </TableCell>
              <TableCell>{row.type}</TableCell>
              <TableCell>
                <ParameterValue parameter={row.count} />
              </TableCell>
              <TableCell>
                {row.note === undefined ? (
                  <ParameterValue parameter={row.topology} />
                ) : (
                  <span className="text-muted whitespace-normal">
                    {row.note}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <ParameterValue parameter={row.responseBurden} />
              </TableCell>
              {hasPanels && (
                <TableCell>
                  <ParameterValue parameter={undefined} />
                </TableCell>
              )}
            </TableRow>
            {row.panels.map((panel) => (
              <TableRow key={panel.id}>
                <TableCell className="ps-12">
                  <span className="text-muted">{PANEL_ROW_LABEL}</span>{' '}
                  {panel.title}
                </TableCell>
                <TableCell>
                  <ParameterValue parameter={undefined} />
                </TableCell>
                <TableCell>
                  <ParameterValue parameter={undefined} />
                </TableCell>
                <TableCell>
                  <ParameterValue parameter={undefined} />
                </TableCell>
                <TableCell>
                  <ParameterValue parameter={undefined} />
                </TableCell>
                <TableCell>
                  <ParameterValue parameter={panel.nominationProbability} />
                </TableCell>
              </TableRow>
            ))}
            {row.conflicts.length > 0 && (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="py-3 whitespace-normal"
                >
                  <div className="flex flex-col gap-3">
                    {row.conflicts.map((conflict, index) => (
                      <SyntheticConflictAlert
                        key={conflictKey(conflict, index)}
                        conflict={conflict}
                      />
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
