import { Link } from 'wouter';

import { Badge } from '@codaco/fresco-ui/Badge';
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

import { AUTHORED_LABEL, DEFAULT_LABEL } from './ParameterValue';
import type { SyntheticVariableRow } from './variableRows';

/**
 * The variable table (spec, Surfaces §4): one row per codebook attribute that
 * synthetic generation can produce a value for, with the resolved behaviour,
 * the interface-implied rules already deciding part of it, and a link to the
 * Codebook where all of it is edited.
 *
 * Read-only: the attribute name is the only interactive element, and it goes to
 * the editor rather than opening one here.
 */

const ATTRIBUTE_HEADER = 'Attribute';
const TYPE_HEADER = 'Type';
const BEHAVIOUR_HEADER = 'Values';
const MISSING_HEADER = 'Unanswered';
const NOTES_HEADER = 'Set by the interview';
const STATUS_HEADER = 'Status';
const EMPTY_MESSAGE =
  'This protocol has no attributes that synthetic data can fill.';
const SELECTION_LABEL = 'Selects';
const CODEBOOK_HREF = '/protocol/codebook';

export type SyntheticVariableTableProps = {
  rows: readonly SyntheticVariableRow[];
  /** The heading that names this table for assistive technology. */
  labelledBy: string;
};

export function SyntheticVariableTable({
  rows,
  labelledBy,
}: SyntheticVariableTableProps) {
  if (rows.length === 0) {
    return <Paragraph className="text-muted">{EMPTY_MESSAGE}</Paragraph>;
  }

  return (
    <Table aria-labelledby={labelledBy}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{ATTRIBUTE_HEADER}</TableHead>
          <TableHead scope="col">{TYPE_HEADER}</TableHead>
          <TableHead scope="col">{BEHAVIOUR_HEADER}</TableHead>
          <TableHead scope="col">{MISSING_HEADER}</TableHead>
          <TableHead scope="col">{NOTES_HEADER}</TableHead>
          <TableHead scope="col">{STATUS_HEADER}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell>
              <span className="flex flex-col">
                <NativeLink
                  // The visible label opens the accessible name (WCAG "Label
                  // in Name"); the rest names the destination, which a reader
                  // moving link to link would otherwise have to guess.
                  aria-label={`${row.name} — open ${row.entityLabel} in the codebook`}
                  render={<Link href={CODEBOOK_HREF} />}
                >
                  {row.name}
                </NativeLink>
                <span className="text-muted text-sm">{row.entityLabel}</span>
              </span>
            </TableCell>
            <TableCell>{row.type}</TableCell>
            <TableCell className="whitespace-normal">
              <span className="flex flex-col">
                <span>{row.behaviour}</span>
                {row.selection !== undefined && (
                  <span className="text-muted text-sm">
                    {SELECTION_LABEL} {row.selection}
                  </span>
                )}
              </span>
            </TableCell>
            <TableCell>{row.missing}</TableCell>
            <TableCell className="max-w-prose whitespace-normal">
              {row.notes.length === 0 ? (
                <>
                  <span aria-hidden className="text-muted">
                    —
                  </span>
                  <span className="sr-only">Nothing</span>
                </>
              ) : (
                <ul className="m-0 list-none space-y-1 p-0">
                  {row.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {row.authored ? AUTHORED_LABEL : DEFAULT_LABEL}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
