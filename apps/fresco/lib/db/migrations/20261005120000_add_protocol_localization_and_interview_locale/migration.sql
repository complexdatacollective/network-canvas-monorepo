-- Every protocol stored before this column existed was written in a schema
-- without languages, and migrating one keys its text by the undetermined
-- language, so the default declares exactly that. The default also keeps a
-- still-running older server able to insert protocols during a rolling deploy.
ALTER TABLE "Protocol" ADD COLUMN "localization" JSONB NOT NULL DEFAULT '{"defaultLocale":"und","locales":["und"]}';

-- Both stay NULL until the interview reports them: the participant's stated
-- language and the language last shown (recorded for exports only).
ALTER TABLE "Interview" ADD COLUMN "localePreference" TEXT;
ALTER TABLE "Interview" ADD COLUMN "locale" TEXT;
