import networkCanvasLogo from "~/images/NC-Mark.svg";
import LaunchPad from "./LaunchPad";

const Home = () => {
	// useProtocolLoader();
	return (
		<div className="justify-center flex flex-col mx-auto m-4 w-5xl">
			{/* <WelcomeHeader /> */}
			{/* <img className="logo" src={headerGraphic} alt="Network Canvas Architect" /> */}
			<div className="welcome-header__title">
				<div className="project-tag">
					<img src={networkCanvasLogo} alt="A Network Canvas project" style={{ height: "2.4rem", width: "2.4rem" }} />
					<h5>Network Canvas</h5>
				</div>
				<h1>Architect</h1>
				<p>A tool for building Network Canvas Interviews</p>
			</div>
			<LaunchPad />
		</div>
	);
};

export default Home;
