/** A stable stage-local seed that consumes none of the ordinary run stream. */
export function familyPedigreeSeed(runSeed: number, stageId: string): number {
  let hash = (runSeed ^ 0x811c9dc5) >>> 0;
  for (let i = 0; i < stageId.length; i++) {
    hash ^= stageId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
