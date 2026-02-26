import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("nginx /api proxy config", () => {
  it("preserves the /api path prefix when proxying upstream", () => {
    const configPath = resolve(process.cwd(), "nginx.conf");
    const config = readFileSync(configPath, "utf-8");

    expect(config).toContain("location /api/ {");
    expect(config).toContain("proxy_pass http://${API_UPSTREAM};");
    expect(config).not.toContain("proxy_pass http://${API_UPSTREAM}/;");
  });
});
