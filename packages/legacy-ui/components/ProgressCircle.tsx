import { animate, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

// This component animates between text values to give the appearance
// of intermediate values. e.g when changing from 25 to 30, this will
// briefly render 26, 27, 28, 29.
interface CounterProps {
	incomingValue: number;
}

const Counter = ({ incomingValue }: CounterProps) => {
	const [counterValue, setCounterValue] = useState(0);
	const nodeRef = useRef();

	useEffect(() => {
		const node = nodeRef.current;
		if (incomingValue === counterValue) {
			return undefined;
		}

		const controls = animate(counterValue, incomingValue, {
			duration: 0.2,
			onUpdate(value) {
				setCounterValue(value);
				node.textContent = value.toFixed(0);
			},
			onComplete() {
				setCounterValue(incomingValue);
			},
		});

		return () => controls.stop();
	}, [incomingValue]);

	return <span ref={nodeRef} />;
};


interface ProgressCircleProps {
	percentProgress: number;
	hideCounter?: boolean;
}

const ProgressCircle = ({ percentProgress, hideCounter = false }: ProgressCircleProps) => {
	const ref = useRef(null);
	const radius = 45;
	const circumference = Math.ceil(2 * Math.PI * radius);
	const fillPercents = Math.abs(Math.ceil((circumference / 100) * (percentProgress - 100)));

	return (
		<div className="progress-circle" ref={ref}>
			<div className="progress-circle__status">
				{!hideCounter && (
					<h1 style={{ margin: 0 }}>
						<Counter incomingValue={percentProgress} />%
					</h1>
				)}
			</div>
			<div className="progress-circle__circle">
				<svg viewBox="0 0 100 100" version="1.1" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
					<circle className="background-circle" cx="50" cy="50" r={radius} />
					<motion.circle
						className="animated-circle"
						cx="50"
						cy="50"
						r={radius}
						stroke={percentProgress === 100 ? "var(--circle-complete-color)" : "var(--circle-color)"}
						fill="transparent"
						strokeDasharray={circumference}
						transform="rotate(-90)"
						initial={{
							strokeDashoffset: circumference,
						}}
						animate={{
							strokeDashoffset: fillPercents,
						}}
					/>
				</svg>
			</div>
		</div>
	);
};


export default ProgressCircle;
