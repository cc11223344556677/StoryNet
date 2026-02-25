import type { ComponentType } from "react";
import type { EntityNeighborhood } from "../../../types/domain";

export type GraphRendererId = "cytoscape" | "vis";

export interface GraphRendererProps {
  neighborhood: EntityNeighborhood | null;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string, nodeLabel: string) => void;
}

export interface GraphRendererDefinition {
  id: GraphRendererId;
  label: string;
  load: () => Promise<{ default: ComponentType<GraphRendererProps> }>;
}