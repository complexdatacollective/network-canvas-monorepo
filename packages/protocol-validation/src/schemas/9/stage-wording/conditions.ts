import type { z } from 'zod';

/** A stage as a protocol holds it, before its shape is known. */
export type StageRecord = Readonly<Record<string, unknown>>;

/**
 * A setting whose wording the stage shows only in some configurations, and
 * the configuration that shows it (see `SuppliedStageSetting.when`).
 */
export type ConditionalSetting = Readonly<{
  /** The stage's own key for the setting. */
  name: string;
  /** Whether the stage shows the setting in its current configuration. */
  when: (stage: StageRecord) => boolean;
  /** What the refusal says when the setting is needed and missing. */
  message: string;
}>;

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? Reflect.get(value, key)
    : undefined;

/** The minimum a name generator sets, when it sets one. */
const minimumNodesOf = (stage: StageRecord): number | undefined => {
  const minNodes = fieldOf(fieldOf(stage, 'behaviours'), 'minNodes');
  return typeof minNodes === 'number' ? minNodes : undefined;
};

/**
 * Whether a name generator sets a minimum the interview enforces. The
 * interview reads a minimum of 0 as no minimum at all.
 */
export const hasMinimumNodes = (stage: StageRecord): boolean =>
  (minimumNodesOf(stage) ?? 0) > 0;

/** Whether a name generator sets a maximum, which the interview enforces. */
export const hasMaximumNodes = (stage: StageRecord): boolean =>
  fieldOf(fieldOf(stage, 'behaviours'), 'maxNodes') !== undefined;

/**
 * Whether a name generator has a side panel reading people from an external
 * data source, rather than only the people already in the interview.
 */
export const hasExternalPanels = (stage: StageRecord): boolean => {
  const panels: unknown = fieldOf(stage, 'panels');
  if (!Array.isArray(panels)) return false;
  return panels.some(
    (panel: unknown) =>
      fieldOf(panel, 'dataSource') !== undefined &&
      fieldOf(panel, 'dataSource') !== 'existing',
  );
};

/** Whether a roster stage has a search, which needs its own wording. */
export const hasRosterSearch = (stage: StageRecord): boolean =>
  fieldOf(stage, 'searchOptions') !== undefined;

/** Whether a Geospatial stage's map has a search box. */
export const hasMapSearch = (stage: StageRecord): boolean =>
  fieldOf(fieldOf(stage, 'mapOptions'), 'allowSearch') === true;

/**
 * Refuses a stage that shows one of its conditional settings without holding
 * it. Each setting is optional in the schema, because the configurations that
 * do not show it need none; this makes it required wherever they do.
 */
export const requireWhenShown = (
  stage: StageRecord,
  ctx: z.RefinementCtx,
  settings: readonly ConditionalSetting[],
): void => {
  for (const setting of settings) {
    if (!setting.when(stage) || fieldOf(stage, setting.name) !== undefined)
      continue;
    ctx.addIssue({
      code: 'custom' as const,
      message: setting.message,
      path: [setting.name],
    });
  }
};
