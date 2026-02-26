export type GraphWorkspaceLeftTab = "search" | "seed" | "snapshot";
export type GraphWorkspaceRightTab = "inspector" | "relationships" | "sources";

export interface GraphWorkspaceLayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  leftTab: GraphWorkspaceLeftTab;
  rightTab: GraphWorkspaceRightTab;
}

const DEFAULT_STATE: GraphWorkspaceLayoutState = {
  leftWidth: 340,
  rightWidth: 360,
  leftCollapsed: false,
  rightCollapsed: false,
  leftTab: "search",
  rightTab: "sources"
};

function getStorageKey(projectId: string): string {
  return `storynet:graph-workspace:${projectId}`;
}

function clampWidth(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(240, Math.min(620, Math.round(value)));
}

function isLeftTab(value: unknown): value is GraphWorkspaceLeftTab {
  return value === "search" || value === "seed" || value === "snapshot";
}

function isRightTab(value: unknown): value is GraphWorkspaceRightTab {
  return value === "inspector" || value === "relationships" || value === "sources";
}

export function getDefaultGraphWorkspaceLayoutState(): GraphWorkspaceLayoutState {
  return { ...DEFAULT_STATE };
}

export function loadGraphWorkspaceLayoutState(projectId: string): GraphWorkspaceLayoutState {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) {
      return getDefaultGraphWorkspaceLayoutState();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return getDefaultGraphWorkspaceLayoutState();
    }

    const value = parsed as Record<string, unknown>;
    return {
      leftWidth: clampWidth(value.leftWidth, DEFAULT_STATE.leftWidth),
      rightWidth: clampWidth(value.rightWidth, DEFAULT_STATE.rightWidth),
      leftCollapsed: Boolean(value.leftCollapsed),
      rightCollapsed: Boolean(value.rightCollapsed),
      leftTab: isLeftTab(value.leftTab) ? value.leftTab : DEFAULT_STATE.leftTab,
      rightTab: isRightTab(value.rightTab) ? value.rightTab : DEFAULT_STATE.rightTab
    };
  } catch {
    return getDefaultGraphWorkspaceLayoutState();
  }
}

export function saveGraphWorkspaceLayoutState(
  projectId: string,
  state: GraphWorkspaceLayoutState
): void {
  try {
    localStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify({
        leftWidth: clampWidth(state.leftWidth, DEFAULT_STATE.leftWidth),
        rightWidth: clampWidth(state.rightWidth, DEFAULT_STATE.rightWidth),
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        leftTab: state.leftTab,
        rightTab: state.rightTab
      })
    );
  } catch {
    // Ignore localStorage failures.
  }
}

