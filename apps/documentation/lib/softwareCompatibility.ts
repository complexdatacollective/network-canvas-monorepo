// Intercompatibility matrix between the build tools (Architect) and the run
// tools (Interviewer / Fresco).
//
// The story we encode: a protocol authored in a build tool targets a single
// schema version, and a run tool can open it when that schema falls within the
// range the run tool accepts. When the protocol's schema is older than the run
// tool's latest supported schema, the run tool upgrades it automatically on
// import — so it still "runs", just after a transparent migration.
//
// Source of truth for schema support is the same as `interfaceCompatibility.ts`
// (the protocol-validation migration files) and the Protocol Schema Information
// article.

export type BuildTool = {
  id: 'architect-web' | 'architect-desktop';
  label: string;
  /** The schema version protocols authored in this tool currently target. */
  buildsSchema: number;
};

export type RunTool = {
  id: 'interviewer-6' | 'interviewer-7' | 'fresco';
  label: string;
  /** Short form used in tight copy, e.g. "6.x reads". */
  shortLabel: string;
  /** Oldest schema this tool will accept; anything older is rejected. */
  minSchema: number;
  /** Newest schema this tool supports; older protocols upgrade to it. */
  maxSchema: number;
};

export const BUILD_TOOLS: BuildTool[] = [
  { id: 'architect-desktop', label: 'Architect (Desktop)', buildsSchema: 7 },
  { id: 'architect-web', label: 'Architect (Web)', buildsSchema: 8 },
];

export const RUN_TOOLS: RunTool[] = [
  {
    id: 'interviewer-6',
    label: 'Interviewer 6.x',
    shortLabel: '6.x',
    minSchema: 4,
    maxSchema: 7,
  },
  {
    id: 'interviewer-7',
    label: 'Interviewer 7',
    shortLabel: 'Interviewer 7',
    minSchema: 7,
    maxSchema: 8,
  },
  {
    id: 'fresco',
    label: 'Fresco',
    shortLabel: 'Fresco',
    minSchema: 7,
    maxSchema: 8,
  },
];

export type CellStatus = 'native' | 'upgrade' | 'incompatible';

export type Cell = {
  status: CellStatus;
  /** Schema the protocol is migrated to when `status === 'upgrade'`. */
  upgradesTo?: number;
};

export function getCell(build: BuildTool, run: RunTool): Cell {
  const schema = build.buildsSchema;

  if (schema < run.minSchema || schema > run.maxSchema) {
    return { status: 'incompatible' };
  }

  if (schema < run.maxSchema) {
    return { status: 'upgrade', upgradesTo: run.maxSchema };
  }

  return { status: 'native' };
}
