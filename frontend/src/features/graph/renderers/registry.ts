import type { GraphRendererDefinition, GraphRendererId } from "./types";

export const graphRendererDefinitions: GraphRendererDefinition[] = [
  {
    id: "cytoscape",
    label: "Cytoscape",
    load: () => import("./cytoscape/CytoscapeGraphRenderer")
  },
  {
    id: "vis",
    label: "vis-network",
    load: () => import("./vis/VisGraphRenderer")
  }
];

const rendererMap = new Map<GraphRendererId, GraphRendererDefinition>(
  graphRendererDefinitions.map((renderer) => [renderer.id, renderer])
);

export function getGraphRendererDefinition(rendererId: GraphRendererId): GraphRendererDefinition {
  return rendererMap.get(rendererId)!;
}