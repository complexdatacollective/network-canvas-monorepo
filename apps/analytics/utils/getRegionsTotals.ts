import { EventPayload } from "@codaco/analytics";
import getEvents from "~/db/getEvents";

export type RegionTotal = {
  country: string;
  total: number;
};

export default async function getRegionsTotals(): Promise<RegionTotal[]> {
  const events: EventPayload[] = await getEvents();
  var countries = require("i18n-iso-countries");

  const calculatedTotals: Record<string, number> = {};

  for (const event of events) {
    const isocode = event.isocode;

    if (isocode) {
      calculatedTotals[isocode] = (calculatedTotals[isocode] || 0) + 1;
    }
  }

  const regionsTotals: RegionTotal[] = [];

  for (const isocode in calculatedTotals) {
    regionsTotals.push({
      country: countries.getName(isocode, "en"),
      total: calculatedTotals[isocode] || 0,
    });
  }

  // Sort in descending order
  regionsTotals.sort((a, b) => b.total - a.total);

  return regionsTotals;
}
