import getEvents, { type Event } from "~/db/getEvents";
import { getName } from "i18n-iso-countries";

export type RegionTotal = {
  country: string;
  total: number;
};

export default async function getRegionsTotals(): Promise<RegionTotal[]> {
  const events: Event[] = await getEvents();

  const calculatedTotals: Record<string, number> = {};

  for (const event of events) {
    const isocode = event.countryISOCode;

    if (isocode) {
      calculatedTotals[isocode] = (calculatedTotals[isocode] ?? 0) + 1;
    }
  }

  const regionsTotals: RegionTotal[] = [];

  for (const isocode in calculatedTotals) {
    regionsTotals.push({
      country: getName(isocode, "en") ?? "",
      total: calculatedTotals[isocode] ?? 0,
    });
  }

  // Sort in descending order
  regionsTotals.sort((a, b) => b.total - a.total);

  return regionsTotals;
}
