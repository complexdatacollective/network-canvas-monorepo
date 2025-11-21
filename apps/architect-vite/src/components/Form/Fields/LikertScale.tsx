/* eslint-disable react/jsx-props-no-spreading */

import type { ComponentProps } from "react";
import Slider from "./Slider";

type LikertScaleProps = ComponentProps<typeof Slider>;

const LikertScale = (props: LikertScaleProps) => <Slider {...props} />;

export default LikertScale;
