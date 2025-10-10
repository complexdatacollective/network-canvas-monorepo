import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth";
import { orpcClient } from "../lib/orpc-client";

export function useSignIn() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ email, password }: { email: string; password: string }) => {
			const result = await authClient.signIn.email({ email, password });
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
		},
	});
}

export function useSignUp() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ email, password, name }: { email: string; password: string; name?: string }) => {
			const result = await authClient.signUp.email({ email, password, name: name || "" });
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
		},
	});
}

export function useSignOut() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			await authClient.signOut();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
		},
	});
}

export function useSession() {
	return useQuery({
		queryKey: ["auth", "session"],
		queryFn: async () => {
			const session = await orpcClient.auth.getSession();
			return session;
		},
		staleTime: 5 * 60 * 1000,
	});
}

export function useCurrentUser() {
	return useQuery({
		queryKey: ["auth", "user"],
		queryFn: async () => {
			const user = await orpcClient.auth.me();
			return user;
		},
		enabled: !!authClient.getSession(),
		staleTime: 5 * 60 * 1000,
	});
}

export function useUpdateProfile() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ email }: { email?: string }) => {
			const user = await orpcClient.auth.updateProfile({ email });
			return user;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
		},
	});
}
