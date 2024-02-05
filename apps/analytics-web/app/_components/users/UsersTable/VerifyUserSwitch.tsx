import { useState } from "react";
import { Switch } from "~/components/ui/switch";

type VerifyUserSwitchProps = {
  id: string;
  verified: boolean;
};

export default function VerifyUserSwitch({
  id,
  verified: initialVerified,
}: VerifyUserSwitchProps) {
  const [localVerified, setLocalVerified] = useState(initialVerified);

  const updateMetadata = async () => {
    try {
      const response = await fetch("/api/clerk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: id, verified: !localVerified }),
      });

      if (!response.ok) {
        setLocalVerified(!localVerified);
        console.error("Database update failed.");
      }
    } catch (error) {
      setLocalVerified;
      console.error("Error updating database:", error);
    }
  };

  const handleToggle = async () => {
    setLocalVerified(!localVerified);
    updateMetadata();
  };

  return <Switch checked={localVerified} onCheckedChange={handleToggle} />;
}
