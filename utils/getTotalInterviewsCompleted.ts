import getEvents from "@/db/getEvents";

export const getTotalInterviewsCompleted = async () => {
  const events = await getEvents();

  const nInterviewsCompleted = events.reduce((count, event) => {
    if (event.type === "InterviewCompleted") {
      return count + 1;
    }
    return count;
  }, 0);

  return nInterviewsCompleted;
};
