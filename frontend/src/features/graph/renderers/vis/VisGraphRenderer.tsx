import { useCallback, useEffect, useRef } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { EntityNeighborhood, GraphEdge, GraphNode } from "../../../../types/domain";
import type { GraphRendererProps } from "../types";

interface VisNode {
  id: string;
  label?: string;
  shape?: "dot";
  size?: number;
  borderWidth?: number;
  color?: {
    background: string;
    border: string;
    highlight: {
      background: string;
      border: string;
    };
  };
  font?: {
    color: string;
    face: string;
    size: number;
  };
}

interface VisEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  arrows?: "to";
  width?: number;
  color?: {
    color: string;
    highlight: string;
  };
  font?: {
    align: "top";
    color: string;
    size: number;
  };
  smooth?: {
    enabled: boolean;
    type: "dynamic";
  };
}

interface NodeVisualState {
  label: string;
  isCenter: boolean;
}

function nodeStyle(isCenter: boolean, isSelected: boolean): Pick<VisNode, "size" | "borderWidth" | "color" | "font"> {
  const background = isCenter ? "#ff7a18" : "#0b5ed7";
  const border = isSelected ? "#111827" : isCenter ? "#ffd7b5" : "#d0e2ff";

  return {
    size: isCenter ? 30 : 24,
    borderWidth: isSelected ? 4 : 2,
    color: {
      background,
      border,
      highlight: {
        background,
        border: "#111827"
      }
    },
    font: {
      color: "#0d1117",
      face: "Segoe UI",
      size: 12
    }
  };
}

function toVisNode(node: GraphNode, isCenter: boolean, isSelected: boolean): VisNode {
  return {
    id: node.id,
    label: node.label,
    shape: "dot",
    ...nodeStyle(isCenter, isSelected)
  };
}

function toVisEdge(edge: GraphEdge): VisEdge {
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label: edge.relation,
    arrows: "to",
    width: 2,
    color: {
      color: "#73839e",
      highlight: "#4b5b75"
    },
    font: {
      align: "top",
      color: "#35455e",
      size: 10
    },
    smooth: {
      enabled: true,
      type: "dynamic"
    }
  };
}

function collectNeighborhoodNodes(neighborhood: EntityNeighborhood): GraphNode[] {
  return [neighborhood.centerNode, ...neighborhood.neighborNodes];
}

export default function VisGraphRenderer({
  neighborhood,
  selectedNodeId,
  onNodeClick
}: GraphRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<any> | null>(null);
  const edgesRef = useRef<DataSet<any> | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const nodeStateRef = useRef<Map<string, NodeVisualState>>(new Map());

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  const applySelectionStyles = useCallback((targetNodeId: string | null): void => {
    const nodes = nodesRef.current;
    const network = networkRef.current;
    if (!nodes || !network) return;

    const updates: VisNode[] = [];
    for (const [nodeId, state] of nodeStateRef.current.entries()) {
      updates.push({
        id: nodeId,
        ...nodeStyle(state.isCenter, nodeId === targetNodeId)
      });
    }

    if (updates.length > 0) {
      nodes.update(updates);
    }

    if (targetNodeId && nodeStateRef.current.has(targetNodeId)) {
      network.selectNodes([targetNodeId]);
    } else {
      network.unselectAll();
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const containerElement = containerRef.current;
    const nodes = new DataSet<any>();
    const edges = new DataSet<any>();

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const network = new Network(
      containerElement,
      { nodes, edges },
      {
        autoResize: true,
        width: "100%",
        height: "100%",
        physics: false,
        layout: {
          improvedLayout: false
        },
        interaction: {
          hover: true,
          navigationButtons: true,
          dragView: true,
          zoomView: true
        }
      }
    );

    networkRef.current = network;

    network.on("click", (params) => {
      if (params.nodes.length === 0) return;
      const clickedNodeId = String(params.nodes[0]);
      const clickedState = nodeStateRef.current.get(clickedNodeId);
      onNodeClickRef.current(clickedNodeId, clickedState?.label ?? "");
    });

    network.on("hoverNode", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "pointer";
      }
    });

    network.on("blurNode", () => {
      if (containerRef.current) {
        containerRef.current.style.cursor = "default";
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      network.redraw();
    });
    resizeObserver.observe(containerElement);

    return () => {
      resizeObserver.disconnect();

      if (containerRef.current) {
        containerRef.current.style.cursor = "default";
      }

      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
      nodeStateRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const network = networkRef.current;
    if (!nodes || !edges || !network) return;

    nodes.clear();
    edges.clear();
    nodeStateRef.current.clear();

    if (!neighborhood) {
      network.unselectAll();
      return;
    }

    const allNodes = collectNeighborhoodNodes(neighborhood);
    const nodeIds = new Set(allNodes.map((node) => node.id));
    const neighborhoodEdges = neighborhood.connectingEdges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    const visNodes = allNodes.map((node) => {
      const isCenter = node.id === neighborhood.centerNode.id;
      nodeStateRef.current.set(node.id, { label: node.label, isCenter });
      return toVisNode(node, isCenter, node.id === selectedNodeId);
    });

    const visEdges = neighborhoodEdges.map((edge) => toVisEdge(edge));

    nodes.add(visNodes);
    edges.add(visEdges);

    applySelectionStyles(selectedNodeId);
    network.fit({ animation: false });
  }, [applySelectionStyles, neighborhood]);

  useEffect(() => {
    applySelectionStyles(selectedNodeId);
  }, [applySelectionStyles, selectedNodeId]);

  return <div ref={containerRef} className="graph-canvas" />;
}