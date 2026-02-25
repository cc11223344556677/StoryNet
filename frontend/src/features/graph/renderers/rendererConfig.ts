import type { GraphRendererId } from "./types";

export const GRAPH_RENDERER_STORAGE_KEY = "storynet.graph.renderer.v1";
export const DEFAULT_GRAPH_RENDERER_ID: GraphRendererId = "cytoscape";

const VALID_RENDERERS: ReadonlySet<GraphRendererId> = new Set(["cytoscape", "vis"]);

function parseRendererId(value: string | null | undefined): GraphRendererId | null {
  if (!value) return null;
  return VALID_RENDERERS.has(value as GraphRendererId) ? (value as GraphRendererId) : null;
}

export function getEnvGraphRendererId(): GraphRendererId {
  return parseRendererId(import.meta.env.VITE_GRAPH_RENDERER) ?? DEFAULT_GRAPH_RENDERER_ID;
}

export function getStoredGraphRendererId(): GraphRendererId | null {
  if (typeof window === "undefined") return null;
  return parseRendererId(window.localStorage.getItem(GRAPH_RENDERER_STORAGE_KEY));
}

export function getInitialGraphRendererId(): GraphRendererId {
  return getStoredGraphRendererId() ?? getEnvGraphRendererId();
}

export function persistGraphRendererId(rendererId: GraphRendererId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GRAPH_RENDERER_STORAGE_KEY, rendererId);
}