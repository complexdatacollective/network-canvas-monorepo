import Stats from "~/components/Stats";
import getErrors from "~/db/getErrors";
import { calculateErrorsLastNDays } from "~/utils/calculateErrorsStats";

export const ErrorsStats = async () => {
  const errors = await getErrors();
  const totalErrors = errors.length;

  const totalErrorsToday = calculateErrorsLastNDays(errors, 1);
  const totalErrorsThisWeek = calculateErrorsLastNDays(errors, 7);
  const totalErrorsThisMonth = calculateErrorsLastNDays(errors, 30);

  return (
    <Stats
      stats={[
        { name: "Total Errors", value: totalErrors },
        { name: "Errors Today", value: totalErrorsToday },
        {
          name: "Errors Last 7 Days",
          value: totalErrorsThisWeek,
        },
        {
          name: "Errors Last 30 Days",
          value: totalErrorsThisMonth,
        },
      ]}
    />
  );
};
