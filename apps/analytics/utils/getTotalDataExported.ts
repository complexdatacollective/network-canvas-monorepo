import getEvents from "~/db/getEvents";

export const getTotalDataExported = async () => {
  const events = await getEvents();

  const nDataExported = events.reduce((count, event) => {
    if (event.type === "DataExported") {
      return count + 1;
    }
    return count;
  }, 0);

  return nDataExported;
};
