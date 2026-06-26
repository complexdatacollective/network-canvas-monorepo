import z from 'zod';

export const IntroductionPanelSchema = z.strictObject({
  title: z.string(),
  text: z.string(),
});
