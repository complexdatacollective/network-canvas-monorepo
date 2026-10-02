import { loadUpdates } from '~/lib/siteContent';
import { buildUpdatesFeed } from '~/lib/updatesFeed';

export const dynamic = 'force-static';

export async function GET() {
  return Response.json(buildUpdatesFeed(await loadUpdates()));
}
