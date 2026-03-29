type InsertPointProps = {
	afterEntityId: string;
	onInsert: (afterEntityId: string) => void;
};

export default function InsertPoint({ afterEntityId, onInsert }: InsertPointProps) {
	return (
		<button
			type="button"
			className="timeline__insert"
			onClick={() => onInsert(afterEntityId)}
			aria-label="Insert entity"
		>
			+
		</button>
	);
}
