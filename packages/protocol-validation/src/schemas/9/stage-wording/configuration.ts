/** A stage as the protocol holds it, before its settings are known to be typed. */
export type StageRecord = Readonly<Record<string, unknown>>;

export const isStageRecord = (value: unknown): value is StageRecord =>
  typeof value === 'object' && value !== null;

/** True when the stage's canvas behaviour `name` is switched on. */
export const behaviourIsOn = (stage: StageRecord, name: string): boolean => {
  const behaviours = stage.behaviours;
  return isStageRecord(behaviours) && behaviours[name] === true;
};
