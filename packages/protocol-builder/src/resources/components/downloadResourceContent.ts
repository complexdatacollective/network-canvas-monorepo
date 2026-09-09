/**
 * Saves a copy of a resource to the researcher's own computer, from the URL
 * the host resolved for it.
 *
 * The contract has no download procedure: `preview` is the only thing that
 * turns an asset id into something a browser can fetch, so a download is that
 * URL handed to a link the page clicks for itself. Nothing is read into memory
 * here and no object URL is made, so there is none to revoke — the URL belongs
 * to the host, and a lease that has run out fails the way any dead link does.
 *
 * `filename` is what the manifest records for the resource, so the copy the
 * researcher ends up with is named the way their protocol names it rather than
 * after whatever the URL happens to end in.
 */
export function downloadResourceContent(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}
