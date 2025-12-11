import z from "zod";

export const IntroductionPanelSchema = z
	.strictObject({
		title: z.string(),
		text: z.string(),
	})
	.generateMock(() => ({
		title: "Introduction Panel Title",
		text: "This is the introduction panel text that provides context to the participant before they proceed.",
	}));
