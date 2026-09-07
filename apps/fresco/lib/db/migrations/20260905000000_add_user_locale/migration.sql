-- A nullable presentation preference; existing accounts continue to follow
-- browser negotiation. No research data or authentication identifiers change.
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_locale_length_check"
  CHECK ("locale" IS NULL OR char_length("locale") BETWEEN 2 AND 35);
