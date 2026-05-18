import Heading from "@codaco/fresco-ui/typography/Heading";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import ncMarkUrl from "~/assets/NC-Flat.svg";
import { getInstallationId } from "~/lib/platform/installationId";

const EASE = [0.22, 1, 0.36, 1] as const;

export function BrandHeader() {
	const [shortId, setShortId] = useState<string>("");

	useEffect(() => {
		setShortId(getInstallationId().slice(0, 6).toUpperCase());
	}, []);

	return (
		<motion.div
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, delay: 0.05, ease: EASE }}
			className="flex items-center gap-[18px]"
		>
			<motion.span
				initial={{ opacity: 0, scale: 0.92 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
				className="inline-flex"
			>
				<img src={ncMarkUrl} alt="" className="size-20" />
			</motion.span>
			<div>
				<Heading level="h1" margin="none" className="font-black tracking-tight">
					Interviewer
				</Heading>
				<div className="mono mt-1.5">{shortId}</div>
			</div>
		</motion.div>
	);
}
