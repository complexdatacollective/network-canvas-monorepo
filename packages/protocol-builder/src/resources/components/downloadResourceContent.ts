import type { ResourceDescriptor } from '../types.ts';

/**
 * What the saved copy is called on the researcher's computer.
 *
 * The resource's own name, which is what the protocol calls it and what they
 * are shown everywhere else. NEVER its `source`: for a committed resource that
 * is the name the host files the bytes under, worked out from the bytes
 * themselves so that two files imported under one filename stay two assets —
 * so a copy named after it would arrive on their desktop as sixty-four hex
 * characters.
 *
 * The extension comes from `source` when the name has none of its own, because
 * an operating system opens a file by its extension and a resource may be
 * named "Neighbourhood photo".
 */
export function resourceDownloadName(descriptor: ResourceDescriptor): string {
  const { name, source } = descriptor;
  const dot = source === undefined ? -1 : source.lastIndexOf('.');
  const extension = dot > 0 ? (source ?? '').slice(dot).toLowerCase() : '';
  return extension === '' || name.toLowerCase().endsWith(extension)
    ? name
    : `${name}${extension}`;
}

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
 * `filename` is what the protocol calls the resource — see
 * {@link resourceDownloadName} — so the copy the researcher ends up with is
 * named the way their protocol names it rather than after whatever the URL
 * happens to end in.
 */
export function downloadResourceContent(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}
