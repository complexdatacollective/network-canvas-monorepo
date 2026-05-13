"use client";

import { createContext } from "react";
import { NULL_TRACKER, type Tracker } from "./tracker";

export const AnalyticsContext = createContext<Tracker>(NULL_TRACKER);
