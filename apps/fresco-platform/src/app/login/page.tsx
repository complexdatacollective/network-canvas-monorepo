"use client";

import { Button, Checkbox, Input } from "@codaco/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSignIn } from "~/hooks/use-auth";

const LoginSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
	rememberMe: z.boolean().optional(),
});

type LoginData = z.infer<typeof LoginSchema>;

export default function LoginPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirectTo = searchParams.get("redirect") || "/dashboard";

	const [showPassword, setShowPassword] = useState(false);
	const signIn = useSignIn();

	const {
		register,
		handleSubmit,
		formState: { errors },
		setError,
	} = useForm<LoginData>({
		resolver: zodResolver(LoginSchema),
		defaultValues: {
			rememberMe: false,
		},
	});

	const onSubmit = async (data: LoginData) => {
		try {
			const result = await signIn.mutateAsync({
				email: data.email,
				password: data.password,
			});

			if (result.error) {
				setError("root", {
					message: result.error.message || "Invalid email or password",
				});
				return;
			}

			router.push(redirectTo);
		} catch {
			setError("root", {
				message: "An error occurred. Please try again.",
			});
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-16">
			<div className="w-full max-w-md">
				<div className="mb-8 text-center">
					<h1 className="mb-2 text-3xl font-bold text-slate-900">Welcome Back</h1>
					<p className="text-slate-600">Sign in to manage your Fresco instances</p>
				</div>

				<div className="rounded-lg bg-white p-8 shadow-sm">
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
						{errors.root && (
							<div className="rounded-md bg-red-50 p-4 text-sm text-red-800" role="alert">
								{errors.root.message}
							</div>
						)}

						<Input
							{...register("email")}
							type="email"
							label="Email Address"
							placeholder="you@example.com"
							error={errors.email?.message}
							required
							autoComplete="email"
							autoFocus
						/>

						<Input
							{...register("password")}
							type={showPassword ? "text" : "password"}
							label="Password"
							placeholder="Enter your password"
							error={errors.password?.message}
							required
							autoComplete="current-password"
							rightAdornment={
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="text-muted-foreground hover:text-foreground"
									tabIndex={-1}
									aria-label={showPassword ? "Hide password" : "Show password"}
								>
									{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
								</button>
							}
						/>

						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Checkbox id="rememberMe" {...register("rememberMe")} />
								<label htmlFor="rememberMe" className="cursor-pointer text-sm text-slate-700">
									Remember me
								</label>
							</div>

							<Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">
								Forgot password?
							</Link>
						</div>

						<Button type="submit" className="w-full" disabled={signIn.isPending}>
							{signIn.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Signing in...
								</>
							) : (
								"Sign In"
							)}
						</Button>
					</form>

					<div className="mt-6 text-center text-sm text-slate-600">
						Don't have an account?{" "}
						<Link href="/signup" className="font-medium text-blue-600 hover:underline">
							Sign up
						</Link>
					</div>
				</div>

				<div className="mt-6 text-center text-xs text-slate-500">
					By signing in, you agree to our{" "}
					<Link href="/terms" className="underline hover:text-slate-700">
						Terms of Service
					</Link>{" "}
					and{" "}
					<Link href="/privacy" className="underline hover:text-slate-700">
						Privacy Policy
					</Link>
				</div>
			</div>
		</div>
	);
}
