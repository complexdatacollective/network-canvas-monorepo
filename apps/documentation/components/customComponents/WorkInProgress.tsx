import { Paragraph } from "@codaco/ui";
import Image from "next/image";
import { useTranslations } from "next-intl";
import PopoutBox from "~/components/PopoutBox";
import { cn } from "~/lib/utils";

const WorkInProgress = () => {
	const t = useTranslations("WorkInProgress");
	return (
		<PopoutBox
			title={t("title")}
			className={cn(
				"bg-success/10 [--link:var(--success)]",
				"![background-color:color-mix(in_oklab,hsl(var(--background))_80%,hsl(var(--success)))]",
			)}
			iconClassName="bg-white"
			icon={<Image src="/images/work-in-progress.svg" alt={t("title")} width={22} height={22} />}
		>
			<Paragraph>{t("content")}</Paragraph>
		</PopoutBox>
	);
};

export default WorkInProgress;
