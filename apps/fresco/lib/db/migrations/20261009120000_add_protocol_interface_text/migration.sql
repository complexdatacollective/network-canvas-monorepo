-- The interview's shared wording a schema 9 protocol holds. NULL for every
-- protocol stored before this column existed, which held none, and for one a
-- still-running older server inserts during a rolling deploy.
ALTER TABLE "Protocol" ADD COLUMN "interfaceText" JSONB;
