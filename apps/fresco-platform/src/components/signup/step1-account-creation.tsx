"use client";

import { Button, Input } from "@codaco/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Eye, EyeOff, XCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type Step1Data, Step1Schema } from "~/lib/wizard-types";

type PasswordStrength = "weak" | "medium" | "strong";

function calculatePasswordStrength(password: string): PasswordStrength {
	if (password.length < 8) return "weak";

	let score = 0;
	if (/[A-Z]/.test(password)) score++;
	if (/[a-z]/.test(password)) score++;
	if (/[0-9]/.test(password)) score++;
	if (/[^A-Za-z0-9]/.test(password)) score++;

	if (score <= 2) return "weak";
	if (score === 3) return "medium";
	return "strong";
}

type Step1Props = {
	initialData?: Step1Data;
	onNext: (data: Step1Data) => void;
};

export function Step1AccountCreation({ initialData, onNext }: Step1Props) {
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<Step1Data>({
		resolver: zodResolver(Step1Schema),
		defaultValues: initialData,
	});

	const password = watch("password") ?? "";
	const passwordStrength = calculatePasswordStrength(password);

	const strengthColors = {
		weak: "bg-red-500",
		medium: "bg-yellow-500",
		strong: "bg-green-500",
	};

	const strengthWidth = {
		weak: "33%",
		medium: "66%",
		strong: "100%",
	};

	return (
		<div className="mx-auto w-full max-w-md space-y-6">
			<div className="space-y-2 text-center">
				<h2 className="text-3xl font-bold">Create Your Account</h2>
				<p className="text-muted-foreground">Enter your email and create a secure password</p>
			</div>

			<form onSubmit={handleSubmit(onNext)} className="space-y-6">
				<Input
					{...register("email")}
					type="email"
					label="Email Address"
					placeholder="you@example.com"
					error={errors.email?.message}
					required
					autoComplete="email"
				/>

				<Input
					{...register("password")}
					type={showPassword ? "text" : "password"}
					label="Password"
					placeholder="Create a strong password"
					error={errors.password?.message}
					required
					autoComplete="new-password"
					rightAdornment={
						<button
							type="button"
							onClick={() => setShowPassword(!showPassword)}
							className="text-muted-foreground hover:text-foreground"
							tabIndex={-1}
						>
							{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
						</button>
					}
				/>

				{password && (
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span>Password strength:</span>
							<span className="font-medium capitalize">{passwordStrength}</span>
						</div>
						<div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
							<div
								className={`h-full transition-all ${strengthColors[passwordStrength]}`}
								style={{ width: strengthWidth[passwordStrength] }}
							/>
						</div>
						<ul className="space-y-1 text-sm">
							<li className="flex items-center gap-2">
								{password.length >= 8 ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-muted-foreground" />
								)}
								<span>At least 8 characters</span>
							</li>
							<li className="flex items-center gap-2">
								{/[A-Z]/.test(password) ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-muted-foreground" />
								)}
								<span>One uppercase letter</span>
							</li>
							<li className="flex items-center gap-2">
								{/[a-z]/.test(password) ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-muted-foreground" />
								)}
								<span>One lowercase letter</span>
							</li>
							<li className="flex items-center gap-2">
								{/[0-9]/.test(password) ? (
									<CheckCircle className="h-4 w-4 text-green-500" />
								) : (
									<XCircle className="h-4 w-4 text-muted-foreground" />
								)}
								<span>One number</span>
							</li>
						</ul>
					</div>
				)}

				<Input
					{...register("confirmPassword")}
					type={showConfirmPassword ? "text" : "password"}
					label="Confirm Password"
					placeholder="Re-enter your password"
					error={errors.confirmPassword?.message}
					required
					autoComplete="new-password"
					rightAdornment={
						<button
							type="button"
							onClick={() => setShowConfirmPassword(!showConfirmPassword)}
							className="text-muted-foreground hover:text-foreground"
							tabIndex={-1}
						>
							{showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
						</button>
					}
				/>

				<div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
					After creating your account, you will receive a verification email. Please verify your email to access your
					Fresco instance.
				</div>

				<Button type="submit" className="w-full">
					Continue
				</Button>
			</form>
		</div>
	);
}
