import Stats from "~/components/Stats";
import { getTotalAppsSetup } from "~/utils/getTotalAppsSetup";
import { getTotalInterviewsCompleted } from "~/utils/getTotalInterviewsCompleted";
import { getTotalInterviewsStarted } from "~/utils/getTotalInterviewsStarted";
import { getTotalProtocolsInstalled } from "~/utils/getTotalProtocolsInstalled";

export const AnalyticsStats = async () => {
  const totalProtocolsInstalled = await getTotalProtocolsInstalled();
  const totalInterviewsCompleted = await getTotalInterviewsCompleted();
  const totalInterviewsStarted = await getTotalInterviewsStarted();
  const totalAppsSetup = await getTotalAppsSetup();

  return (
    <Stats
      stats={[
        { name: "Protocols Installed", value: totalProtocolsInstalled },
        { name: "Interviews Completed", value: totalInterviewsCompleted },
        { name: "Interviews Started", value: totalInterviewsStarted },
        { name: "Apps Setup", value: totalAppsSetup },
      ]}
    />
  );
};
