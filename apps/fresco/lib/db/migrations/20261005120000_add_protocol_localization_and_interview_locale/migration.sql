-- Every protocol stored before this column existed was written in a schema
-- without languages, and migrating one keys its text by English, so the
-- default declares exactly that. The default also keeps a
-- still-running older server able to insert protocols during a rolling deploy.
ALTER TABLE "Protocol" ADD COLUMN "localization" JSONB NOT NULL DEFAULT '{"defaultLocale":"en","locales":["en"]}';
