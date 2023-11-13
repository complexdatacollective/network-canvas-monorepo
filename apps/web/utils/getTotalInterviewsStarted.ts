import getEvents from "@/db/getEvents";

export const getTotalInterviewsStarted = async () => {
  const events = await getEvents();

  const nInterviewsStarted = events.reduce((count, event) => {
    if (event.type === "InterviewStarted") {
      return count + 1;
    }
    return count;
  }, 0);

  return nInterviewsStarted;
};
