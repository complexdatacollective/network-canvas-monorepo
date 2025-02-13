import getMigrationPath from "./getMigrationPath";

const getMigrationNotes = (sourceSchemaVersion: number, targetSchemaVersion: number) => {
	try {
		const migrationPath = getMigrationPath(sourceSchemaVersion, targetSchemaVersion);

		const notes = migrationPath.reduce((acc: { notes?: string; version: number }[], migration) => {
			if (!migration.notes) {
				return acc;
			}
			acc.push({ notes: migration.notes, version: migration.version });
			return acc;
		}, []);
		return notes;
	} catch (_e) {
		return undefined;
	}
};

export default getMigrationNotes;
