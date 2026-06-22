// Compatibility matrix for interface documentation.
//
// Not every interface can be configured/run in every app — availability is
// schema dependent. Rather than hand-authoring app support per interface, we
// author only the schema version each interface was introduced in, and derive
// app support from each app's maximum supported schema version.

// Sources of truth for `introducedIn` values are the protocol-validation
// migration files (`packages/protocol-validation/src/schemas/*/migration.ts`).

export type AppRole = 'configure' | 'run';

export type AppId =
  | 'architect-desktop'
  | 'architect-web'
  | 'interviewer'
  | 'fresco';

const APPS: Record<AppId, { label: string; role: AppRole; maxSchema: number }> =
  {
    'architect-desktop': {
      label: 'Architect (Desktop)',
      role: 'configure',
      maxSchema: 7,
    },
    'architect-web': {
      label: 'Architect (Web)',
      role: 'configure',
      maxSchema: 8,
    },
    'interviewer': { label: 'Interviewer', role: 'run', maxSchema: 8 },
    'fresco': { label: 'Fresco', role: 'run', maxSchema: 8 },
  };

const INTERFACE_INTRODUCED_IN: Record<string, number> = {
  // Schema 8 additions (schemas/8/migration.ts)
  'geospatial': 8,
  'anonymisation': 8,
  'one-to-many-dyad-census': 8,
  'family-tree-census': 8,
  // Schema 6 — NameGeneratorRoster family (schemas/6/migration.ts)
  'name-generator-roster': 6,
  'large-roster-name-generator': 6,
  'small-roster-name-generator': 6,
  // Schema 5 — TieStrengthCensus (schemas/5/migration.ts)
  'tie-strength-census': 5,
  // Baseline (schema 1)
  'sociogram': 1,
  'categorical-bin': 1,
  'ordinal-bin': 1,
  'information': 1,
  'narrative': 1,
  'ego-form': 1,
  'per-alter-form': 1,
  'per-alter-edge-form': 1,
  'dyad-census': 1,
  'name-generator-using-forms': 1,
  'name-generator-using-quick-add': 1,
};

export type AppCompatibility = {
  id: AppId;
  label: string;
  role: AppRole;
  maxSchema: number;
  supported: boolean;
};

export type InterfaceCompatibility = {
  introducedIn: number;
  apps: AppCompatibility[];
};

/**
 * Resolve the app/schema compatibility for an interface documentation slug.
 * Returns `null` for slugs that are not interfaces (e.g. 'shared') or are
 * missing from the matrix.
 */
export function getCompatibility(
  slug: string | undefined,
): InterfaceCompatibility | null {
  if (!slug) {
    return null;
  }

  const introducedIn = INTERFACE_INTRODUCED_IN[slug];
  if (introducedIn === undefined) {
    return null;
  }

  const apps = (Object.entries(APPS) as [AppId, (typeof APPS)[AppId]][]).map(
    ([id, app]) => ({
      id,
      ...app,
      supported: app.maxSchema >= introducedIn,
    }),
  );

  return { introducedIn, apps };
}
