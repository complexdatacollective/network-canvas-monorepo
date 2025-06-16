import { getContext } from "recompose";

/**
 * A `windowRoot` (Element) context consumer
 *
 * Using windowRootConsumer() will attach the `windowRoot` context (provided by
 * `windowRootProvider()`) to a component's props as `props.windowRoot`.
 *
 * Also adds the setter method to props as `props.setWindowRoot(Element)`.
 *
 * Usage as a HOC:
 *
 * class MyConsumingComponent extends Component {
 *   constructor() {
 *     this.el = document.createElement('div');
 *   }
 *
 *   componentDidMount() {
 *     this.windowRoot.appendChild(this.el);
 *   }
 *
 *   componentWillUnmount() {
 *     this.windowRoot.removeChild(this.el);
 *   }
 * }
 *
 * // This is where we attach the consumer
 * export windowRootConsumer(MyConsumingComponent);
 */
interface WindowRootContext {
	windowRoot: Element | null;
	setWindowRoot: (element: Element | null) => void;
}

const windowRootConsumer = getContext<WindowRootContext>({
	windowRoot: null,
	setWindowRoot: () => {},
});

export default windowRootConsumer;
