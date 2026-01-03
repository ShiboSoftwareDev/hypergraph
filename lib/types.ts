export type GraphPointId = string;
export type GraphEdgeId = string;
export type GraphRegionId = string;

export type GraphEdge = {
	edgeId: GraphEdgeId;
	fromPointId: GraphPointId;
	toPointId: GraphPointId;
};

export type GraphPoint = {
	pointId: GraphPointId;
	x: number;
	y: number;
	width?: number;
	height?: number;
	edges: GraphEdge[];
};

export type GraphRegion = {
	regionId: GraphRegionId;
	points: GraphPoint[];
};

export type Candidate = {
	pointId: GraphPointId;
	g: number;
	h: number;
	f: number;
	hops: number;
	parent?: Candidate;
	lastEdgeId?: GraphEdgeId;
	lastRegionId: GraphRegionId;
	nextRegionId: GraphRegionId;
};
