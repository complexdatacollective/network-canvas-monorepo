import z from 'zod';

export const IntroductionPanelSchema = z.strictObject({
  title: z.string().min(1),
  text: z.string().min(1),
});
