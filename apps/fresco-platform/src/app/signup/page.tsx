import { SignupWizard } from "~/components/signup/signup-wizard";

export const metadata = {
	title: "Sign Up - Fresco Platform",
	description: "Create your Fresco instance and start collecting network data",
};

export default function SignupPage() {
	return <SignupWizard />;
}
