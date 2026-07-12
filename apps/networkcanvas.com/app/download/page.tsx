import { permanentRedirect } from 'next/navigation';

import { GET_STARTED_PATH } from '~/lib/getStarted';

export default function DownloadPage() {
  permanentRedirect(GET_STARTED_PATH);
}
