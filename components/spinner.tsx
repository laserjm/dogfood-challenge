import type { SVGProps } from "react";

export function Spinner(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			role="status"
			aria-label="Loading"
			{...props}
		>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
			<path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
				<animateTransform
					attributeName="transform"
					type="rotate"
					from="0 12 12"
					to="360 12 12"
					dur="0.8s"
					repeatCount="indefinite"
				/>
			</path>
		</svg>
	);
}

export default Spinner;
