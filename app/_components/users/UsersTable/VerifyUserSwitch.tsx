import { Switch } from "@/components/ui/switch";

type VerifyUserSwitchProps = {
  id: string;
  verified: boolean;
};

export default function VerifyUserSwitch({
  id,
  verified,
}: VerifyUserSwitchProps) {
  const handleToggle = async () => {
    await fetch("/api/clerk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: id, verified: !verified }),
    });
  };

  return (
    <Switch checked={verified} onCheckedChange={handleToggle}>
      Verify
    </Switch>
  );
}
