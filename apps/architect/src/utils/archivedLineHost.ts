// An archived major line is served from its own host, `v<major>.<zone>`
// (architect-archive-release.yml), and a later release on that line is the
// only update its worker can receive. Update notes there must describe that
// release, never a newer major the host will not serve.
export const isArchivedLineHost = (
  hostname: string,
  version: string,
): boolean => {
  const major = /^(\d+)\./.exec(version)?.[1];
  return major !== undefined && hostname.startsWith(`v${major}.`);
};
