import Link from "next/link";

export const metadata = {
	title: "Forgot Password - Fresco Platform",
	description: "Reset your password",
};

export default function ForgotPasswordPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-16">
			<div className="w-full max-w-md">
				<div className="mb-8 text-center">
					<h1 className="mb-2 text-3xl font-bold text-slate-900">Password Reset</h1>
					<p className="text-slate-600">This feature is coming soon</p>
				</div>

				<div className="rounded-lg bg-white p-8 shadow-sm">
					<p className="mb-6 text-center text-sm text-slate-600">
						Password reset functionality will be available in a future update. For now, please contact support if you
						need to reset your password.
					</p>

					<Link
						href="/login"
						className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-white hover:bg-blue-700"
					>
						Back to Login
					</Link>
				</div>
			</div>
		</div>
	);
}
