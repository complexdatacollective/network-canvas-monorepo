import getEvents from "~/db/getEvents";

export const getTotalErrors = async () => {
  const events = await getEvents();

  const nErrors = events.reduce((count, event) => {
    if (event.type === "Error") {
      return count + 1;
    }
    return count;
  }, 0);

  return nErrors;
};
