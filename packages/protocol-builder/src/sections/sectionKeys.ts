/**
 * The stable names of the sections a stage editor is made of.
 *
 * A section's title is what a researcher reads: it is translated, and its
 * English wording is free to change. A key is what a host (a help link, a
 * walkthrough, a test) uses to say WHICH section it means, so it names the
 * section's purpose and never its current wording, and it is never translated.
 *
 * One key names one kind of section wherever it appears: a section shared by
 * several stage editors carries the same key in all of them. A key is unique
 * within any one stage editor, but not across the page, so it is carried as
 * `data-section-key` rather than as an `id`.
 *
 * Add a key here when a new section is added: `BuilderSection` takes only keys
 * of this type.
 */
export const SECTION_KEYS = [
  'at-risk-statuses',
  'background',
  'canvas-permissions',
  'card-display',
  'closing-screen',
  'completeness',
  'composer-connection-forms',
  'composer-connections',
  'composer-node-form',
  'composer-nodes',
  'built-in-wording',
  'disease-mappings',
  'edge-type',
  'encrypted-attributes',
  'filter-network',
  'finish-mode',
  'finished-screen',
  'form-fields',
  'gender-identity',
  'interviewer-guidance',
  'languages',
  'map-access',
  'map-appearance',
  'map-layers',
  'map-view',
  'node-availability',
  'node-layout',
  'node-type',
  'nomination-limits',
  'nomination-prompts',
  'outcome',
  'page-content',
  'passphrase-rules',
  'pedigree-prompt',
  'pedigree-source',
  'pedigree-wording',
  'person-attributes',
  'person-form-fields',
  'placing-nodes',
  'presets',
  'prompts',
  'quick-add',
  'relationship-to-participant',
  'relationships',
  'roster-panel',
  'roster-search',
  'roster-sorting',
  'roster-source',
  'side-panels',
  'skip-logic',
  'task-explanation',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
