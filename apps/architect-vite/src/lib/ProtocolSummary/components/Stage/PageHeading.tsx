type PageHeadingProps = {
	heading?: string | null;
};

const PageHeading = ({ heading = null }: PageHeadingProps) => {
	if (!heading) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__page-heading">
			<div className="protocol-summary-stage__page-heading-content">
				<h2 className="section-heading">Page Heading</h2>
				<h2>{heading}</h2>
			</div>
		</div>
	);
};

export default PageHeading;
