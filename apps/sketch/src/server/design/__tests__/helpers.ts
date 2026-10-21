import { readFileSync } from 'node:fs';

import { StudyDesignSchema, type StudyDesign } from '../schema.ts';

// Every golden fixture was compiled at this instant.
export const NOW = new Date('2026-10-20T00:00:00.000Z');

export const readFixture = (name: string): string =>
  readFileSync(new URL(`../__fixtures__/${name}`, import.meta.url), 'utf8');

export const readJsonFixture = (name: string): unknown =>
  JSON.parse(readFixture(name));

/** The provider grammar guarantees shape; the fixtures must hold to it too. */
export const parseDesign = (design: unknown): StudyDesign =>
  StudyDesignSchema.parse(design);

export const stageTypes = (protocol: { stages: { type: string }[] }) =>
  protocol.stages.map((s) => s.type);
