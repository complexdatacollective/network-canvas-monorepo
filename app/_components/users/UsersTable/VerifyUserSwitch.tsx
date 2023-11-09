import { updateUserVerification } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import { useOptimistic } from "react";

type VerifyUserSwitchProps = {
  id: string;
  verified: boolean;
};

export default function VerifyUserSwitch({
  id,
  verified,
}: VerifyUserSwitchProps) {
  const handleToggle = async () => {
    await updateUserVerification(id, !verified);
  };

  return (
    <Switch checked={verified} onCheckedChange={handleToggle}>
      Verify
    </Switch>
  );
}
