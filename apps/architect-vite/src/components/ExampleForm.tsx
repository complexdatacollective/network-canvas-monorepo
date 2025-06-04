import Modal from "@codaco/legacy-ui/Modal";

/*
 *  <ExampleForm
 *    show={formOpen}
 *    onComplete={() => {
 *      // Form specific callback, probably also changes state of formOpen
 *      closeForm();
 *    }}
 *  />
 */

type ExampleFormProps = {
	show?: boolean;
	onBlur?: () => void;
	onComplete?: () => void;
};

const ExampleForm = ({ show = false, onBlur = () => {}, onComplete = () => {} }: ExampleFormProps) => (
	<Modal show={show} onBlur={onBlur}>
		<div style={{ background: "white", padding: "20px", borderRadius: "20px" }}>
			Name:
			<input type="text" />
			<button type="button" onClick={onComplete}>
				Confirm
			</button>
		</div>
	</Modal>
);

export { ExampleForm };

export default ExampleForm;
