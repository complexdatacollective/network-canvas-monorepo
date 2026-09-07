-- Preserve every historical record and its exportable message. Only new
-- events carry a stable application message kind plus named, literal values.
ALTER TABLE "Events" ADD COLUMN "localization" JSONB;
