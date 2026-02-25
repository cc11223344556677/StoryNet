import type { Core } from "cytoscape";
import type { EntityNeighborhood, GraphCommandResult, GraphEdge, GraphNode } from "../../../../types/domain";

export class CytoscapeGraphController {
  private cy: Core | null = null;

  attach(cy: Core): void { this.cy = cy; }
  detach(): void { this.cy = null; }

  renderNeighborhood(neighborhood: EntityNeighborhood): void {
    if (!this.cy) return;

    const cy = this.cy;

    const allNodes: GraphNode[] = [neighborhood.centerNode, ...neighborhood.neighborNodes];
    const nodeIds = new Set(allNodes.map((node) => node.id));
    const edges: GraphEdge[] = neighborhood.connectingEdges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    const elements = [
      ...allNodes.map((node) => ({
        data: { id: node.id, label: node.label, type: node.type },
        classes: node.id === neighborhood.centerNode.id ? "center-node" : ""
      })),
      ...edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, label: edge.relation }
      }))
    ];

    // Stop any in-flight camera/layout motion before rendering the new neighborhood.
    cy.stop();
    cy.elements().stop();

    cy.elements().remove();
    cy.add(elements);

    const layout = cy.layout({
      name: "breadthfirst",
      roots: [neighborhood.centerNode.id],
      directed: false,
      animate: false,
      fit: false,
      padding: 80,
      spacingFactor: 1.2
    });

    layout.one("layoutstop", () => {
      this.selectNode(neighborhood.centerNode.id);
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