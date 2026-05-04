/// <reference types="vite/client" />

type Window = {
	__e2eMap?: import("mapbox-gl").Map;
	__interviewStore?: import("redux").Store<import("./store/store").RootState>;
};
