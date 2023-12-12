import Stats from "~/components/Stats";
import getErrors from "~/db/getErrors";

export const ErrorsStats = async () => {
  const errors = await getErrors();
  const totalErrors = errors.length;

  // TODO: calculate these values
  const totalErrorsToday = 2;
  const totalErrorsThisWeek = 3;
  const totalErrorsThisMonth = 4;

  return (
    <Stats
      stats={[
        { name: "Total Errors", value: totalErrors },
        { name: "Errors Today", value: totalErrorsToday },
        { name: "Errors This Week", value: totalErrorsThisWeek },
        { name: "Errors This Month", value: totalErrorsThisMonth },
      ]}
    />
  );
};
