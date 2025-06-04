import { useCallback } from "react";
import { connect } from "react-redux";
import InternalLink from "~/components/Link";
import { actionCreators as screenActions } from "~/ducks/modules/ui/screens";

type ScreenLinkProps = {
	openScreen: (screen: string, options: any) => void;
	closeScreen: (screen: string) => void;
	onClick?: () => void;
	screen: string;
	closeExisting?: string;
	children: React.ReactNode;
} & Record<string, any>;

const ScreenLink = ({ children, screen, openScreen, closeExisting = null, closeScreen, onClick = null, ...options }: ScreenLinkProps) => {
	const handleOpenStage = useCallback(() => {
		if (closeExisting) {
			closeScreen(closeExisting);
		}
		openScreen(screen, options);
		if (onClick) {
			onClick();
		}
	}, ["openScreen", "onClick"]);

	return <InternalLink onClick={handleOpenStage}>{children}</InternalLink>;
};


const mapDispatchToProps = {
	openScreen: screenActions.openScreen,
	closeScreen: screenActions.closeScreen,
};

export default connect(null, mapDispatchToProps)(ScreenLink);
