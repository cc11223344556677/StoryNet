import type { Core } from "cytoscape";
import type { GraphCommandResult, GraphEdge, GraphNode } from "../../../../types/domain";
import type { GraphRenderModel } from "../types";

export class CytoscapeGraphController {
  private cy: Core | null = null;

  attach(cy: Core): void { this.cy = cy; }
  detach(): void { this.cy = null; }

  renderGraph(graph: GraphRenderModel): void {
    if (!this.cy) return;

    const cy = this.cy;

    const nodes: GraphNode[] = graph.nodes;
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges: GraphEdge[] = graph.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    const elements = [
      ...nodes.map((node) => ({
        data: { id: node.id, label: node.label, type: node.type }
      })),
      ...edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, label: edge.relation }
      }))
    ];

    // Stop any in-flight camera/layout motion before rendering the graph.
    cy.stop();
    cy.elements().stop();

    cy.elements().remove();
    cy.add(elements);

    const layout = cy.layout({
      name: "cose",
      animate: false,
      fit: false,
      padding: 80,
      nodeOverlap: 10
    });

    layout.one("layoutstop", () => {
      cy.fit(cy.elements(), 80);
    });

    layout.run();
  }

  selectNode(nodeId: string): void {
    if (!this.cy) return;

    const cy = this.cy;
    cy.nodes().removeClass("selected-node");

    const node = cy.$id(nodeId);
    if (!node || node.empty()) return;

    node.addClass("selected-node");
  }

  selectEdge(edgeId: string): void {
    if (!this.cy) return;

    const cy = this.cy;
    cy.edges().removeClass("selected-edge");

    const edge = cy.$id(edgeId);
    if (!edge || edge.empty()) return;

    edge.addClass("selected-edge");
  }

  clearEdgeSelection(): void {
    if (!this.cy) return;
    this.cy.edges().removeClass("selected-edge");
  }

  clearSelection(): void {
    if (!this.cy) return;
    this.cy.nodes().removeClass("selected-node");
    this.cy.edges().removeClass("selected-edge");
  }

  // Reserved extension hooks for later graph editing phases.
  addNode(_node: GraphNode): GraphCommandResult {
    return { supported: false, message: "addNode is reserved for a future graph editing phase." };
  }

  // Reserved extension hooks for later graph editing phases.
  updateNode(_node: GraphNode): GraphCommandResult {
    return { supported: false, message: "updateNode is reserved for a future graph editing phase." };
  }

  // Reserved extension hooks for later graph editing phases.
  addEdge(_edge: GraphEdge): GraphCommandResult {
    return { supported: false, message: "addEdge is reserved for a future graph editing phase." };
  }

  // Reserved extension hooks for later graph editing phases.
  updateEdge(_edge: GraphEdge): GraphCommandResult {
    return { supported: false, message: "updateEdge is reserved for a future graph editing phase." };
  }
}
