import type { Connection, HyperGraph, SerializedConnection } from "./types"

export const convertSerializedConnectionsToConnections = (
  inputConnections: (Connection | SerializedConnection)[],
  graph: HyperGraph,
): Connection[] => {
  const connections: Connection[] = []
  for (const inputConn of inputConnections) {
    if ("startPointId" in inputConn) {
      connections.push({
        connectionId: inputConn.connectionId,
        startPoint: graph.points.find(
          (point) => point.pointId === inputConn.startPointId,
        )!,
        endPoint: graph.points.find(
          (point) => point.pointId === inputConn.endPointId,
        )!,
      })
    } else {
      connections.push(inputConn)
    }
  }
  return connections
}
