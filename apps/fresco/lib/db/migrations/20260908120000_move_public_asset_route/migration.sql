-- The route that serves S3-backed protocol media moved from /api/assets/<key>
-- to /api/public/assets/<key>, so that a reverse proxy can restrict every other
-- /api/ path to the researchers' network (see SECURITY.md). The S3 backend
-- persists that path as the asset's URL at upload time, so stored rows are
-- rewritten here. UploadThing rows hold absolute URLs on UploadThing's CDN and
-- match neither pattern, so they are left as they are.
UPDATE "Asset"
SET "url" = regexp_replace("url", '^/api/assets/', '/api/public/assets/')
WHERE "url" LIKE '/api/assets/%';

UPDATE "Protocol"
SET "originalFileUrl" = regexp_replace("originalFileUrl", '^/api/assets/', '/api/public/assets/')
WHERE "originalFileUrl" LIKE '/api/assets/%';
