import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server";

describe("VS Code Server configuration", () => {
  it("normalizes a configured server URL before exposing it to the panel", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: { serverUrl: "http://127.0.0.1:8080/" },
    });
    await plugin(bb);

    await expect(harness.behavior.callRpc("vscode_server_url", null)).resolves.toEqual({
      url: "http://127.0.0.1:8080",
    });
  });

  it("keeps the panel unconfigured when no explicit URL or environment fallback exists", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: { serverUrl: "" },
    });
    await plugin(bb);

    await expect(harness.behavior.callRpc("vscode_server_url", null)).resolves.toEqual({
      url: null,
    });
  });
});
