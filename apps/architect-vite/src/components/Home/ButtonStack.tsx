import type React from "react";

type ButtonStackProps = {
	children: React.ReactNode;
};

const ButtonStack = ({ children }: ButtonStackProps) => <div className="button-stack">{children}</div>;

export default ButtonStack;
