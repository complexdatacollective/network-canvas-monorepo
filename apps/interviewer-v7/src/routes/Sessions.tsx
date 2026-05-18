import { Download, PlayCircle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Surface from '@codaco/fresco-ui/layout/Surface';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@codaco/fresco-ui/Table';
import { useToast } from '@codaco/fresco-ui/Toast';
import PageHeader from '@codaco/fresco-ui/typography/PageHeader';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ExportDialog } from '~/components/ExportDialog';
import { deleteSessions, listSessions } from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';

function formatStatus(session: StoredSession): { label: string; tone: string } {
  if (session.exportedAt) return { label: 'Exported', tone: 'text-success' };
  if (session.finishedAt) return { label: 'Finished', tone: 'text-info' };
  return { label: 'In progress', tone: 'text-text/60' };
}

export function SessionsRoute() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [, navigate] = useLocation();
  const toast = useToast();
  const { confirm } = useDialog();

  const reload = useCallback(async () => {
    setSessions(await listSessions());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected =
    sessions.length > 0 && sessions.every((s) => selected.has(s.id));
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (sessions.every((s) => prev.has(s.id))) return new Set();
      return new Set(sessions.map((s) => s.id));
    });
  }, [sessions]);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const result = await confirm({
      title: `Delete ${selected.size} interview${selected.size === 1 ? '' : 's'}?`,
      description:
        'Deleted interviews cannot be recovered. Export first if you want to keep the data.',
      confirmLabel: 'Delete',
      intent: 'destructive',
      onConfirm: async () => {
        await deleteSessions(Array.from(selected));
      },
    });
    if (result === true) {
      setSelected(new Set());
      toast.add({
        title: 'Deleted',
        description: `${selected.size} interview(s)`,
      });
      await reload();
    }
  }, [confirm, reload, selected, toast]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          headerText="Interviews"
          subHeaderText="Resume, export, and remove collected sessions."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={selected.size === 0}
            icon={<Download className="size-4" />}
            onClick={() => setExportOpen(true)}
          >
            Export {selected.size > 0 ? `(${selected.size})` : 'selected'}
          </Button>
          <Button
            disabled={selected.size === 0}
            variant="outline"
            icon={<Trash2 className="size-4" />}
            onClick={() => void handleDelete()}
          >
            Delete
          </Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <Surface level={1} spacing="xl" className="text-center">
          <Paragraph emphasis="muted">No interviews recorded yet.</Paragraph>
        </Surface>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  value={allSelected}
                  onChange={() => toggleAll()}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Case ID</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => {
              const status = formatStatus(session);
              const checked = selected.has(session.id);
              return (
                <TableRow key={session.id}>
                  <TableCell>
                    <Checkbox
                      value={checked}
                      onChange={() => toggle(session.id)}
                      aria-label={`Select ${session.caseId}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {session.caseId}
                  </TableCell>
                  <TableCell>{session.protocolName}</TableCell>
                  <TableCell>
                    {new Date(session.startedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className={status.tone}>{status.label}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<PlayCircle className="size-4" />}
                      onClick={() => navigate(`/interview/${session.id}`)}
                    >
                      {session.finishedAt ? 'Review' : 'Resume'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ExportDialog
        open={exportOpen}
        sessionIds={selectedIds}
        onClose={() => {
          setExportOpen(false);
          void reload();
        }}
      />
    </div>
  );
}
