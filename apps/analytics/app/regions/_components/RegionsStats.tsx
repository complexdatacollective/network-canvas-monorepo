import Stats from "~/components/Stats";
import { getNRegions } from "~/utils/getRegionsTotals";

export const RegionsStats = async () => {
  const nRegions = await getNRegions();

  return <Stats stats={[{ name: "Unique Countries", value: nRegions }]} />;
};
