import cx from "classnames";
import { AnimatePresence, motion } from "motion/react";
import { useDispatch } from "react-redux";
import Version from "~/components/Version";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import headerGraphic from "~/images/Arc-Flat.svg";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import Button from "~/lib/legacy-ui/components/Button";
import { openExternalLink } from "../ExternalLink";
import Group from "./Group";
import Section from "./Section";
import Switch from "./Switch";
import useAppState from "./useAppState";

const WelcomeHeader = () => {
	const [isOpen, setIsOpen] = useAppState("showWelcome", true);

	const dispatch = useDispatch();
	const downloadSampleProtocol = () => dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));

	const classes = cx(
		"relative rounded-(--border-radius) shadow-(--architect-panel-shadow) my-10 mx-auto max-w-4xl overflow-hidden flex flex-col flex-wrap",
		"welcome-header",
		isOpen ? "welcome-header--is-open bg-slate-blue text-white" : "bg-transparent",
	);

	const start = {
		show: {
			opacity: 1,
			height: "100%",
			transition: {
				stiffness: 100,
				dampening: 10,
			},
		},
		hide: {
			opacity: 0,
			height: "0px",
			transition: {
				duration: 0.5,
			},
		},
	};

	return (
		<Section className={classes}>
			<Group className="welcome-header__header">
				<img className="logo" src={headerGraphic} alt="Network Canvas Architect" />
				<div className="welcome-header__title">
					<div className="project-tag">
						<img src={networkCanvasLogo} alt="A Network Canvas project" style={{ height: "2.4rem", width: "2.4rem" }} />
						<h5>Network Canvas</h5>
					</div>
					<h1>Architect</h1>
					<p>A tool for building Network Canvas Interviews</p>
				</div>
				<Version />
				<Switch
					className="welcome-header__header-toggle"
					label="Show welcome"
					on={isOpen}
					onChange={() => setIsOpen(!isOpen)}
				/>
			</Group>
			<motion.section className="welcome-header__panel">
				<AnimatePresence initial={false}>
					{isOpen && (
						<motion.div variants={start} initial="hide" animate="show" exit="hide">
							<Group className="home-welcome text-white">
								<div className="home-welcome__content">
									<h2>Welcome to Architect!</h2>
									<p>
										Architect is a tool for building Network Canvas interviews. To learn more about the software, and
										how to use it, please visit the documentation website.
									</p>
									<p>
										If you encounter any issues, or have any questions, please visit our user community, where we will
										be happy to help.
									</p>
									<div className="welcome-actions">
										<Button
											className="button bg-cerulean-blue button--with-new before:bg-white before:text-rich-black"
											color="cerulean-blue"
											onClick={() => openExternalLink("https://community.networkcanvas.com")}
										>
											Community Website
										</Button>
										{/* <Button
                      color="primary"
                      onClick={() => window.open('https://www.youtube.com/watch?v=XzfE6j-LnII', '_blank', 'noopener,noreferrer')}
                    >
                      Watch overview video
                    </Button> */}
										<Button
											color="sea-serpent"
											onClick={() => openExternalLink("https://documentation.networkcanvas.com")}
										>
											Documentation website
										</Button>
										<Button color="mustard" onClick={downloadSampleProtocol}>
											Download Sample Protocol
										</Button>
									</div>
								</div>
							</Group>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.section>
		</Section>
	);
};

export default WelcomeHeader;
