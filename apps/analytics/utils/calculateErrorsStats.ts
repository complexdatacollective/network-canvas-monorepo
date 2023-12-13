import { ErrorPayload } from "@codaco/analytics";

export const calculateErrorsLastNDays = (
  errors: ErrorPayload[],
  n: number
): number => {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - n);

  return errors.filter((error) => {
    const errorDate = error.timestamp ? new Date(error.timestamp) : null;
    return errorDate && errorDate >= startDate;
  }).length;
};
