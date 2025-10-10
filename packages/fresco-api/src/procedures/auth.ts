import { z } from "zod";
import { authedProcedure, publicProcedure } from "../lib/orpc.js";

export const authRouter = {
	getSession: publicProcedure.func(async ({ context }) => {
		if (!context.user) {
			return null;
		}

		return {
			user: context.user,
		};
	}),

	me: authedProcedure.func(async ({ context }) => {
		const user = await context.prisma.user.findUnique({
			where: { id: context.user.id },
			select: {
				id: true,
				email: true,
				emailVerified: true,
				createdAt: true,
			},
		});

		if (!user) {
			throw new Error("User not found");
		}

		return user;
	}),

	updateProfile: authedProcedure
		.$input(
			z.object({
				email: z.string().email().optional(),
			}),
		)
		.func(async ({ input, context }) => {
			const user = await context.prisma.user.update({
				where: { id: context.user.id },
				data: {
					email: input.email,
				},
				select: {
					id: true,
					email: true,
					emailVerified: true,
					createdAt: true,
				},
			});

			return user;
		}),
};
