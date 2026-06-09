'use client';

import { ArrowDown, ArrowRight, ArrowUp, Check, X } from 'lucide-react';
import { useState } from 'react';

import {
  BUILD_TOOLS,
  type BuildTool,
  type Cell,
  getCell,
  RUN_TOOLS,
  type RunTool,
} from '~/lib/softwareCompatibility';
import { cn } from '~/lib/utils';

type Hovered = { buildId: string; runId: string } | null;

// Soft tints derived from semantic tokens so the matrix adapts to light/dark.
// Each is the brand background mixed with a brand accent, so the tile stays on
// palette and theme-correct (including the neutral "muted" tile in dark mode).
const SOFT = {
  success:
    'bg-[color-mix(in_oklab,hsl(var(--background))_88%,hsl(var(--success)))]',
  warning:
    'bg-[color-mix(in_oklab,hsl(var(--background))_88%,hsl(var(--warning)))]',
  muted:
    'bg-[color-mix(in_oklab,hsl(var(--background))_92%,hsl(var(--muted-foreground)))]',
} as const;

const STRONG = {
  success:
    'bg-[color-mix(in_oklab,hsl(var(--background))_70%,hsl(var(--success)))] ring-success/60',
  warning:
    'bg-[color-mix(in_oklab,hsl(var(--background))_70%,hsl(var(--warning)))] ring-warning/60',
  muted:
    'bg-[color-mix(in_oklab,hsl(var(--background))_82%,hsl(var(--muted-foreground)))] ring-muted-foreground/40',
} as const;

// Text tones, darkened toward (light/dark) `--foreground` so they meet contrast
// on the soft tinted tiles in BOTH themes — the raw brand hues (mid-lightness
// teal/orange) are too low-contrast as text. The colour still reads as its
// brand family; the icon + tile tint reinforce meaning.
const TEXT = {
  success:
    'text-[color-mix(in_oklab,hsl(var(--success))_56%,hsl(var(--foreground)))]',
  warning:
    'text-[color-mix(in_oklab,hsl(var(--warning))_56%,hsl(var(--foreground)))]',
  muted:
    'text-[color-mix(in_oklab,hsl(var(--foreground))_70%,hsl(var(--background)))]',
} as const;

const CellBody = ({
  cell,
  build,
  run,
}: {
  cell: Cell;
  build: BuildTool;
  run: RunTool;
}) => {
  if (cell.status === 'incompatible') {
    return (
      <>
        <X className={cn(TEXT.muted, 'h-5 w-5 shrink-0')} aria-hidden />
        <span className={cn(TEXT.muted, 'text-sm font-semibold')}>
          Not compatible
        </span>
        <span className={cn(TEXT.muted, 'text-xs')}>
          schema {build.buildsSchema} is newer than {run.shortLabel} reads
        </span>
      </>
    );
  }

  if (cell.status === 'upgrade') {
    return (
      <>
        <Check className={cn(TEXT.warning, 'h-5 w-5 shrink-0')} aria-hidden />
        <span className={cn(TEXT.warning, 'text-sm font-semibold')}>
          Runs — upgraded
        </span>
        <span className={cn(TEXT.warning, 'text-xs')}>
          schema {build.buildsSchema} → {cell.upgradesTo}
        </span>
      </>
    );
  }

  return (
    <>
      <Check className={cn(TEXT.success, 'h-5 w-5 shrink-0')} aria-hidden />
      <span className={cn(TEXT.success, 'text-sm font-semibold')}>
        Runs as-is
      </span>
      <span className={cn(TEXT.success, 'text-xs')}>schemas match</span>
    </>
  );
};

const Pill = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      'bg-background/80 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      TEXT.muted,
      className,
    )}
  >
    {children}
  </span>
);

const toneFor = (cell: Cell): keyof typeof SOFT => {
  if (cell.status === 'incompatible') return 'muted';
  if (cell.status === 'upgrade') return 'warning';
  return 'success';
};

const CompatibilityMatrix = () => {
  const [hovered, setHovered] = useState<Hovered>(null);

  return (
    <div
      className={cn(
        'my-8 rounded-3xl p-5 sm:p-7',
        'bg-[color-mix(in_oklab,hsl(var(--background))_88%,hsl(var(--accent)))]',
      )}
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-foreground text-xl font-bold">
          Protocol compatibility
        </h3>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-2.5">
          <caption className="sr-only">
            Compatibility between Architect build tools (rows) and the interview
            apps that run their protocols (columns).
          </caption>
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[27%]" />
            <col className="w-[27%]" />
            <col className="w-[27%]" />
          </colgroup>
          <thead>
            <tr>
              {/* Corner */}
              <td
                className="align-bottom"
                aria-label="Rows list build tools; columns list the apps that run their protocols"
              >
                <span className="flex flex-col items-start gap-1.5 pb-1">
                  <Pill>
                    Run in <ArrowRight className="h-3 w-3" />
                  </Pill>
                  <Pill>
                    Build in <ArrowDown className="h-3 w-3" />
                  </Pill>
                </span>
              </td>

              {/* Column headers (run tools) */}
              {RUN_TOOLS.map((run) => {
                const isActiveCol = hovered?.runId === run.id;
                const dim = hovered && !isActiveCol;
                return (
                  <th
                    scope="col"
                    key={run.id}
                    className={cn(
                      'px-1 text-center align-middle font-normal transition-opacity duration-150',
                      dim && 'opacity-50',
                    )}
                  >
                    <span className="text-foreground block text-base font-bold">
                      {run.label}
                    </span>
                    <span className="mt-1.5 flex justify-center">
                      <Pill>
                        runs{' '}
                        <strong className="font-semibold">
                          schema {run.maxSchema}
                        </strong>
                      </Pill>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {BUILD_TOOLS.map((build) => {
              const isActiveRow = hovered?.buildId === build.id;
              const rowDim = hovered && !isActiveRow;
              return (
                <tr key={build.id}>
                  {/* Row header (build tool) */}
                  <th
                    scope="row"
                    className={cn(
                      'px-1 text-start align-middle font-normal transition-opacity duration-150',
                      rowDim && 'opacity-50',
                    )}
                  >
                    <span className="text-foreground block text-base font-bold">
                      {build.label}
                    </span>
                    <span className="mt-1.5 flex">
                      <Pill>
                        builds{' '}
                        <strong className="font-semibold">
                          schema {build.buildsSchema}
                        </strong>
                      </Pill>
                    </span>
                  </th>

                  {/* Cells */}
                  {RUN_TOOLS.map((run) => {
                    const cell = getCell(build, run);
                    const tone = toneFor(cell);
                    const isActiveCell =
                      hovered?.buildId === build.id &&
                      hovered?.runId === run.id;
                    const cellDim = hovered && !isActiveCell;

                    return (
                      <td
                        key={run.id}
                        onMouseEnter={() =>
                          setHovered({ buildId: build.id, runId: run.id })
                        }
                        onMouseLeave={() => setHovered(null)}
                        className={cn(
                          'relative rounded-xl px-3 py-5 text-center align-middle transition-all duration-150 ring-inset',
                          isActiveCell
                            ? cn(STRONG[tone], 'shadow-lg ring-2')
                            : SOFT[tone],
                          cellDim && 'opacity-45',
                        )}
                      >
                        {cell.status === 'upgrade' && (
                          <span
                            className={cn(
                              TEXT.warning,
                              'bg-warning/25 absolute top-2 right-2 rounded px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide',
                            )}
                          >
                            1-WAY
                          </span>
                        )}
                        <span className="flex flex-col items-center justify-center gap-1">
                          <CellBody cell={cell} build={build} run={run} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Pill className={cn(SOFT.success, TEXT.success)}>
          <Check className="h-3.5 w-3.5" /> Runs as-is
          <span className="font-normal opacity-80">· no change</span>
        </Pill>
        <Pill className={cn(SOFT.warning, TEXT.warning)}>
          <Check className="h-3.5 w-3.5" /> Upgrades
          <span className="font-normal opacity-80">· one-way</span>
        </Pill>
        <Pill className={cn(SOFT.muted, TEXT.muted)}>
          <X className="h-3.5 w-3.5" /> Not compatible
        </Pill>
      </div>

      {/* Footnote */}
      <div className="mt-4 flex items-start gap-3">
        <span
          className={cn(
            SOFT.warning,
            TEXT.warning,
            'mt-0.5 flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1',
          )}
          aria-hidden
        >
          <Check className="h-4 w-4" />
          <ArrowUp className="h-3.5 w-3.5" />
        </span>
        <p className={cn(TEXT.muted, 'text-sm')}>
          A protocol built for an older schema still runs — the newer app
          upgrades it automatically when you import it. That upgrade is{' '}
          <strong className="text-foreground font-semibold">one-way</strong>: an
          upgraded protocol can&apos;t be converted back to an earlier schema or
          opened in Architect Desktop.
        </p>
      </div>
    </div>
  );
};

export default CompatibilityMatrix;
