import { describe, expect, it, vi } from "vitest";
import { RestStoryNetApiClient } from "../api/restClient";

describe("rest client error normalization", () => {
  it("surfaces actionable 400 detail messages", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: [
              {
                loc: ["body", "snapshot", "entities", 0, "first_seen"],
                msg: "extra fields not permitted"
              }
            ]
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        )
      );

    const client = new RestStoryNetApiClient("/api");

    await expect(client.listProjects()).rejects.toMatchObject({
      message: "Request validation failed: extra fields not permitted",
      status: 400
    });

    fetchSpy.mockRestore();
  });
});
