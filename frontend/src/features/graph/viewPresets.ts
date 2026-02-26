import type { GraphRendererId } from "./renderers/types";

export interface GraphViewPreset {
  id: string;
  name: string;
  rendererId: GraphRendererId;
  hiddenSchemas: string[];
  snapshotSearchInput?: string;
  globalSearchInput?: string;
  createdAt: string;
  updatedAt: string;
}

function getStorageKey(projectId: string): string {
  return `storynet:graph-presets:${projectId}`;
}

export function loadGraphViewPresets(projectId: string): GraphViewPreset[] {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is GraphViewPreset => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.rendererId === "string" &&
        Array.isArray(candidate.hiddenSchemas) &&
        typeof candidate.createdAt === "string" &&
        typeof candidate.updatedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function saveGraphViewPresets(projectId: string, presets: GraphViewPreset[]): void {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(presets));
  } catch {
    // Ignore storage write failures (quota/private mode).
  }
}
