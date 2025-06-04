import AssetBadge from "../AssetBadge";

type DataSourceProps = {
	dataSource?: string | null;
};

const DataSource = ({ dataSource = null }: DataSourceProps) => {
	if (!dataSource) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__data-source">
			<div className="protocol-summary-stage__data-source-content">
				<h2 className="section-heading">DataSource</h2>
				<AssetBadge id={dataSource} link />
			</div>
		</div>
	);
};


export default DataSource;
