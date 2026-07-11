import { protocolMigrations } from '@codaco/protocol-validation';

const getMigrationNotes = (from, to) =>
  protocolMigrations.getMigrationNotes(from, to);

export default getMigrationNotes;
