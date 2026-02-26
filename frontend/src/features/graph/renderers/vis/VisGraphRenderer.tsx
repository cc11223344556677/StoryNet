import { useCallback, useEffect, useRef } from "react";
import { DataSet, Network } from "vis-network/standalone";
import type { GraphEdge, GraphNode } from "../../../../types/domain";
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
}

type VisEdgeStyleUpdate = Pick<VisEdge, "id"> & Pick<VisEdge, "width" | "color">;

function edgeStyle(isSelected: boolean): Pick<VisEdge, "width" | "color"> {
  return {
    width: isSelected ? 4 : 2,
    color: {
      color: isSelected ? "#111827" : "#73839e",
      highlight: isSelected ? "#111827" : "#4b5b75"
    }
  };
}

function nodeStyle(isSelected: boolean): Pick<VisNode, "size" | "borderWidth" | "color" | "font"> {
  const background = "#0b5ed7";
  const border = isSelected ? "#111827" : "#d0e2ff";

  return {
    size: 24,
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

function toVisNode(node: GraphNode, isSelected: boolean): VisNode {
  return {
    id: node.id,
    label: node.label,
    shape: "dot",
    ...nodeStyle(isSelected)
  };
}

function toVisEdge(edge: GraphEdge, isSelected: boolean): VisEdge {
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    label: edge.relation,
    arrows: "to",
    ...edgeStyle(isSelected),
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

export default function VisGraphRenderer({
  graph,
  selectedNodeId,
  selectedEdgeId,
  onNodeClick,
  onEdgeClick
}: GraphRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<any> | null>(null);
  const edgesRef = useRef<DataSet<any> | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  const nodeStateRef = useRef<Map<string, NodeVisualState>>(new Map());
  const edgeIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    onEdgeClickRef.current = onEdgeClick;
  }, [onEdgeClick]);

  const applySelectionStyles = useCallback((targetNodeId: string | null, targetEdgeId: string | null): void => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const network = networkRef.current;
    if (!nodes || !edges || !network) return;

    const updates: VisNode[] = [];
    for (const nodeId of nodeStateRef.current.keys()) {
      updates.push({
        id: nodeId,
        ...nodeStyle(nodeId === targetNodeId)
      });
    }

    if (updates.length > 0) {
      nodes.update(updates);
    }

    const edgeUpdates: VisEdgeStyleUpdate[] = [];
    for (const edgeId of edgeIdsRef.current) {
      edgeUpdates.push({
        id: edgeId,
        ...edgeStyle(edgeId === targetEdgeId)
      });
    }

    if (edgeUpdates.length > 0) {
      edges.update(edgeUpdates);
    }

    if (targetNodeId && nodeStateRef.current.has(targetNodeId)) {
      network.selectNodes([targetNodeId]);
    } else {
      network.unselectAll();
    }

    if (targetEdgeId && edgeIdsRef.current.has(targetEdgeId)) {
      network.selectEdges([targetEdgeId]);
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
      if (params.nodes.length > 0) {
        const clickedNodeId = String(params.nodes[0]);
        const clickedState = nodeStateRef.current.get(clickedNodeId);
        onNodeClickRef.current(clickedNodeId, clickedState?.label ?? "");
        return;
      }

      if (params.edges.length > 0) {
        onEdgeClickRef.current(String(params.edges[0]));
      }
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
      edgeIdsRef.current.clear();
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
    edgeIdsRef.current.clear();

    if (!graph) {
      network.unselectAll();
      return;
    }

    const allNodes = graph.nodes;
    const nodeIds = new Set(allNodes.map((node) => node.id));
    const graphEdges = graph.edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    );

    const visNodes = allNodes.map((node) => {
      nodeStateRef.current.set(node.id, { label: node.label });
      return toVisNode(node, node.id === selectedNodeId);
    });

    const visEdges = graphEdges.map((edge) => toVisEdge(edge, edge.id === selectedEdgeId));
    edgeIdsRef.current = new Set(visEdges.map((edge) => edge.id));

    nodes.add(visNodes);
    edges.add(visEdges);

    applySelectionStyles(selectedNodeId, selectedEdgeId);
    network.fit({ animation: false });
  }, [applySelectionStyles, graph, selectedEdgeId, selectedNodeId]);

  useEffect(() => {
    applySelectionStyles(selectedNodeId, selectedEdgeId);
  }, [applySelectionStyles, selectedEdgeId, selectedNodeId]);

  return <div ref={containerRef} className="graph-canvas" />;
}
