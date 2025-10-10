import Link from "next/link";

export default function HomePage() {
	return (
		<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
			<div className="container mx-auto px-4 py-16">
				<header className="text-center mb-16">
					<h1 className="text-5xl font-bold text-slate-900 mb-4">Network Canvas Fresco Platform</h1>
					<p className="text-xl text-slate-600 max-w-2xl mx-auto">
						Deploy your own isolated instance of Network Canvas Fresco in minutes. Perfect for research studies,
						testing, and learning.
					</p>
				</header>

				<div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8 mb-16">
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-2">Isolated Environment</h3>
						<p className="text-slate-600">Each instance runs in its own container with a dedicated database schema</p>
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-2">Quick Deployment</h3>
						<p className="text-slate-600">Get up and running in under 2 minutes with our automated setup</p>
					</div>
					<div className="bg-white p-6 rounded-lg shadow-sm">
						<h3 className="text-lg font-semibold mb-2">Full Control</h3>
						<p className="text-slate-600">Start, stop, and manage your instance from a simple dashboard</p>
					</div>
				</div>

				<div className="text-center">
					<Link
						href="/signup"
						className="inline-flex items-center justify-center px-8 py-3 text-lg font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
					>
						Deploy Your Instance
					</Link>
					<p className="mt-4 text-sm text-slate-500">
						Already have an account?{" "}
						<Link href="/login" className="text-blue-600 hover:underline">
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
