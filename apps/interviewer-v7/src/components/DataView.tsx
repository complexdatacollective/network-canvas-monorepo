import { Check, Download, Filter, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import { getSettings, markSessionsExported } from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import {
  buildExportOptions,
  type ExportProgress,
  runExport,
} from '~/lib/export/exportSessions';
import { downloadBlob } from '~/lib/files/download';

type DataViewProps = {
  sessions: StoredSession[];
  onReload: () => Promise<void>;
};

type StatusKind = 'in-progress' | 'complete' | 'exported';
type FilterKind = 'all' | 'in-progress' | 'complete';

function getStatus(session: StoredSession): StatusKind {
  if (session.exportedAt) return 'exported';
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}

function statusLabel(kind: StatusKind): string {
  switch (kind) {
    case 'in-progress':
      return 'In progress';
    case 'complete':
      return 'Complete';
    case 'exported':
      return 'Exported';
  }
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] font-heading font-extrabold text-xs uppercase tracking-[0.08em]';

function statusChipClass(kind: StatusKind): string {
  if (kind === 'in-progress') return `${CHIP_BASE} bg-mustard/22 text-mustard`;
  return `${CHIP_BASE} bg-sea-green/22 text-sea-green`;
}

const HEADER_CELL_CLASS =
  'px-3.5 py-3 text-left font-heading text-xs font-black uppercase tracking-widest text-text/60';
const CELL_CLASS = 'px-3.5 py-3.5';
const FILTER_PILL_BASE =
  'px-[18px] py-2.5 border-0 rounded-full cursor-pointer font-heading font-extrabold text-xs tracking-[0.06em] uppercase';

export function DataView({ sessions, onReload }: DataViewProps) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKind>('all');
  const [search, setSearch] = useState('');
  const [sortDescending, setSortDescending] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Drop selections that no longer correspond to a current session (after a
  // reload removed them).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(sessions.map((s) => s.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [sessions]);

  const counts = useMemo(() => {
    let inProgress = 0;
    let complete = 0;
    for (const session of sessions) {
      const kind = getStatus(session);
      if (kind === 'in-progress') inProgress += 1;
      else complete += 1;
    }
    return { all: sessions.length, inProgress, complete };
  }, [sessions]);

  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    const rows = sessions.filter((session) => {
      const kind = getStatus(session);
      if (filter === 'in-progress' && kind !== 'in-progress') return false;
      if (filter === 'complete' && kind === 'in-progress') return false;
      if (trimmed.length > 0 && !session.caseId.toLowerCase().includes(trimmed))
        return false;
      return true;
    });
    const sorted = [...rows].toSorted((a, b) => {
      const cmp = a.startedAt.localeCompare(b.startedAt);
      return sortDescending ? -cmp : cmp;
    });
    return sorted;
  }, [filter, search, sessions, sortDescending]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback(async () => {
    if (selected.size === 0 || exporting) return;
    setExporting(true);
    try {
      const settings = await getSettings();
      const options = buildExportOptions({
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        useScreenLayoutCoordinates: settings.useScreenLayoutCoordinates,
        screenLayoutHeight: settings.screenLayoutHeight,
        screenLayoutWidth: settings.screenLayoutWidth,
      });
      const onEvent = (_event: ExportProgress) => {};
      const { result, blob, fileName } = await runExport({
        options,
        sessionIds: Array.from(selected),
        onEvent,
      });
      if (!blob || !fileName) {
        throw new Error('Export produced no file');
      }
      const download = await downloadBlob(blob, fileName);
      if (!download.saved) {
        toast.add({
          title: 'Export canceled',
          description: 'The archive was not saved.',
        });
        return;
      }
      await markSessionsExported(
        result.successfulExports.map((s) => s.sessionId),
      );
      if (result.failedExports.length > 0) {
        toast.add({
          title: 'Export completed with errors',
          description: `${result.failedExports.length} session(s) failed.`,
          variant: 'destructive',
        });
      } else {
        toast.add({
          title: 'Export complete',
          description: fileName,
          variant: 'success',
        });
      }
      setSelected(new Set());
      await onReload();
    } catch (cause) {
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, onReload, selected, toast]);

  const filterOptions: { id: FilterKind; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'in-progress', label: 'In progress', count: counts.inProgress },
    { id: 'complete', label: 'Complete', count: counts.complete },
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-[18px] overflow-y-auto px-11 pb-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="bg-surface flex gap-1.5 rounded-full p-1">
          {filterOptions.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`${FILTER_PILL_BASE} ${
                  active
                    ? 'bg-sea-green text-primary-contrast'
                    : 'text-text/80 bg-transparent'
                }`}
              >
                {option.label} · {option.count}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search
            size={16}
            aria-hidden
            className="text-text/60 absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search participant ID..."
            aria-label="Search participant ID"
            className="bg-surface font-heading text-text min-w-[220px] rounded-full border-0 py-2.5 pr-4 pl-9 text-sm font-bold"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Filter size={14} strokeWidth={2.5} aria-hidden />}
          onClick={() => setSortDescending((value) => !value)}
          aria-pressed={sortDescending}
        >
          Sort
        </Button>
        {selected.size > 0 ? (
          <Button
            color="primary"
            size="sm"
            icon={<Download size={14} strokeWidth={2.5} aria-hidden />}
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : `Export ${selected.size} selected`}
          </Button>
        ) : null}
      </div>

      <Surface
        as="section"
        level={0}
        spacing="none"
        noContainer
        className="overflow-hidden"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-1 text-left">
              {[
                '',
                'Participant',
                'Protocol',
                'Started',
                'Duration',
                'Progress',
                'Status',
              ].map((header, index) => (
                <th
                  key={header || `col-${index}`}
                  scope="col"
                  className={HEADER_CELL_CLASS}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((session) => {
              const kind = getStatus(session);
              const isSelected = selected.has(session.id);
              return (
                <tr
                  key={session.id}
                  className={`border-outline/60 border-t ${isSelected ? 'bg-sea-green/10' : 'bg-transparent'}`}
                >
                  <td className={CELL_CLASS}>
                    <button
                      type="button"
                      aria-label={`Select ${session.caseId}`}
                      aria-pressed={isSelected}
                      onClick={() => toggle(session.id)}
                      className={`text-primary-contrast inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md border-2 p-0 ${
                        isSelected
                          ? 'border-sea-green bg-sea-green'
                          : 'border-outline bg-transparent'
                      }`}
                    >
                      {isSelected ? (
                        <Check size={12} strokeWidth={3.4} aria-hidden />
                      ) : null}
                    </button>
                  </td>
                  <td
                    className={`${CELL_CLASS} font-monospace text-xs font-bold`}
                  >
                    {session.caseId}
                  </td>
                  <td className={CELL_CLASS}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="bg-sea-green h-2.5 w-2.5 rounded-full"
                      />
                      <span className="font-heading font-extrabold">
                        {session.protocolName}
                      </span>
                    </span>
                  </td>
                  <td className={CELL_CLASS}>
                    {new Date(session.startedAt).toLocaleString()}
                  </td>
                  <td className={CELL_CLASS}>—</td>
                  <td className={`${CELL_CLASS} min-w-[140px]`}>
                    <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
                      step {session.currentStep + 1}
                    </span>
                  </td>
                  <td className={CELL_CLASS}>
                    <span className={statusChipClass(kind)}>
                      {statusLabel(kind)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-text/60 px-3.5 py-10 text-center"
                >
                  {sessions.length === 0
                    ? 'No interviews recorded yet.'
                    : 'No interviews match this filter.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
