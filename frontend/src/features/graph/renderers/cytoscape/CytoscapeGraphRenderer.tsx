import { useEffect, useMemo, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphRendererProps } from "../types";
import { CytoscapeGraphController } from "./CytoscapeGraphController";

export default function CytoscapeGraphRenderer({
  neighborhood,
  selectedNodeId,
  onNodeClick
}: GraphRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const controller = useMemo(() => new CytoscapeGraphController(), []);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!containerRef.current) return;

    const containerElement = containerRef.current;
    const cy = cytoscape({
      container: containerElement,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#0b5ed7",
            label: "data(label)",
            color: "#0d1117",
            "font-size": 12,
            "font-weight": 600,
            "text-valign": "top",
            "text-margin-y": -10,
            width: 46,
            height: 46,
            "border-width": 2,
            "border-color": "#d0e2ff"
          }
        },
        {
          selector: "node.center-node",
          style: {
            "background-color": "#ff7a18",
            width: 58,
            height: 58,
            "border-color": "#ffd7b5"
          }
        },
        {
          selector: "node.selected-node",
          style: {
            "border-color": "#111827",
            "border-width": 4
          }
        },
        {
          selector: "node.hovered-node",
          style: {
            "border-color": "#0b5ed7",
            "border-width": 4,
            "z-index": 9999
          }
        },
        {
          selector: "edge",
          style: {
            width: 2,
            "line-color": "#73839e",
            "target-arrow-color": "#73839e",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 10,
            color: "#35455e",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.8,
            "text-background-padding": "3px"
          }
        }
      ],
      wheelSensitivity: 0.2
    });

    controller.attach(cy);
    cy.on("tap", "node", (event) => {
      const nodeId = event.target.id();
      const nodeLabel = String(event.target.data("label") ?? "");
      onNodeClickRef.current(nodeId, nodeLabel);
    });
    cy.on("mouseover", "node", (event) => event.target.addClass("hovered-node"));
    cy.on("mouseout", "node", (event) => event.target.removeClass("hovered-node"));

    const resizeObserver = new ResizeObserver(() => {
      cy.resize();
    });
    resizeObserver.observe(containerElement);

    return () => {
      resizeObserver.disconnect();
      controller.detach();
      cy.destroy();
    };
  }, [controller]);

  useEffect(() => {
    if (neighborhood) controller.renderNeighborhood(neighborhood);
  }, [controller, neighborhood]);

  useEffect(() => {
    if (selectedNodeId) controller.selectNode(selectedNodeId);
  }, [controller, selectedNodeId]);

  return <div ref={containerRef} className="graph-canvas" />;
}