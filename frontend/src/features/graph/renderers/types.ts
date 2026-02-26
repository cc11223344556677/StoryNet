import type { ComponentType } from "react";
import type { GraphEdge, GraphNode } from "../../../types/domain";

export type GraphRendererId = "cytoscape" | "vis";

export interface GraphRenderModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphRendererProps {
  graph: GraphRenderModel | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onNodeClick: (nodeId: string, nodeLabel: string) => void;
  onEdgeClick: (edgeId: string) => void;
}

export interface GraphRendererDefinition {
  id: GraphRendererId;
  label: string;
  load: () => Promise<{ default: ComponentType<GraphRendererProps> }>;
}
