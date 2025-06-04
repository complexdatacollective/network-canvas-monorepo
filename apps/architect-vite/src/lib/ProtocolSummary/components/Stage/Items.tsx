import Markdown from "@codaco/legacy-ui/components/Fields/Markdown";
import Asset from "../Asset";
import MiniTable from "../MiniTable";

type ItemsProps = {
	items?: Array<{
		id?: string;
		type?: string;
		content?: string;
		size?: string;
	}> | null;
};

const Items = ({ items = null }: ItemsProps) => {
	if (!items) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__items">
			<div className="protocol-summary-stage__items-content">
				<h2 className="section-heading">Items</h2>
				{items.map(({ type, content, size, id }) => {
					switch (type) {
						case "asset":
							return (
								<div className="protocol-summary-stage__items-item" key={id}>
									<Asset id={content} size={size} />
								</div>
							);
						default:
							return (
								<div className="protocol-summary-stage__items-item--text" key={id}>
									<MiniTable
										rotated
										rows={[
											["Block Size", size],
											["Type", "Text"],
											// eslint-disable-next-line jsx-a11y/media-has-caption
											["Content", <Markdown label={content} />],
										]}
									/>
								</div>
							);
					}
				})}
			</div>
		</div>
	);
};

export default Items;
