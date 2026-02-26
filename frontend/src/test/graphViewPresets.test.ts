import { describe, expect, it } from "vitest";
import { loadGraphViewPresets, saveGraphViewPresets } from "../features/graph/viewPresets";

describe("graph view presets storage", () => {
  it("saves and loads presets by project id", () => {
    saveGraphViewPresets("project-1", [
      {
        id: "preset-1",
        name: "Analyst",
        rendererId: "cytoscape",
        hiddenSchemas: ["Ownership"],
        snapshotSearchInput: "marko",
        globalSearchInput: "petrovic",
        createdAt: "2026-02-26T00:00:00.000Z",
        updatedAt: "2026-02-26T00:00:00.000Z"
      }
    ]);

    const loaded = loadGraphViewPresets("project-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Analyst");

    expect(loadGraphViewPresets("project-2")).toEqual([]);
  });

  it("drops invalid payload entries from storage", () => {
    localStorage.setItem(
      "storynet:graph-presets:project-1",
      JSON.stringify([
        {
          id: "preset-valid",
          name: "Valid",
          rendererId: "vis",
          hiddenSchemas: [],
          createdAt: "2026-02-26T00:00:00.000Z",
          updatedAt: "2026-02-26T00:00:00.000Z"
        },
        {
          id: "preset-invalid",
          rendererId: "vis"
        }
      ])
    );

    const loaded = loadGraphViewPresets("project-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("preset-valid");
  });
});
