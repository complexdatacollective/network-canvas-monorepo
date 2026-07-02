// Web-only: plain fetch applies and the user is responsible for hosting the
// protocol on a CORS-enabled origin.
export async function fetchProtocolFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Server responded with ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
