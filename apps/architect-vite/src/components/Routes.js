import { useSelector } from "react-redux";
import Home from "~/src/components/Home/Home";
import Loading from "~/src/components/Loading";
import Protocol from "~/src/components/Protocol";
import Screens from "~/src/components/Screens";
import { getActiveProtocol } from "~/src/selectors/session";
import { getScreensStack } from "~/src/selectors/ui";

const getRoute = ({ activeProtocol }) => {
	if (activeProtocol) {
		return <Protocol />;
	}
	return <Home />;
};

const Routes = () => {
	const activeProtocol = useSelector(getActiveProtocol);
	const screens = useSelector(getScreensStack);
	const route = getRoute({ activeProtocol, screens });

	return (
		<>
			{route}
			<Screens />
			<Loading />
		</>
	);
};

export default Routes;
