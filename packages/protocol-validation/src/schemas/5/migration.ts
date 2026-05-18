import { createMigration, type ProtocolDocument } from '~/migration';

const migrationV4toV5 = createMigration({
  from: 4,
  to: 5,
  dependencies: {},
  notes: `- Enable the 'Tie Strength Census' interface, which will allow you to conduct a dyad census that also captures the strength of the tie and assigns it to an ordinal variable.
- Add new validation options for form fields: \`unique\`, \`sameAs\`, and \`differentFrom\`.
- Enable an 'Interview Script' section for each stage, where notes for the interviewer can be added.`,
  migrate: (doc) =>
    ({
      ...doc,
      schemaVersion: 5 as const,
    }) as ProtocolDocument<5>,
});

export default migrationV4toV5;
