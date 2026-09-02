import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin, { discoverAndStoreServerUrl, discoverServerUrl } from "./server";

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


  it("stores a detected loopback URL through its supplied setting writer", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const storeServerUrl = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetch);

    try {
      await expect(discoverAndStoreServerUrl(storeServerUrl)).resolves.toBe(
        "http://127.0.0.1:8080",
      );
      expect(storeServerUrl).toHaveBeenCalledWith("http://127.0.0.1:8080");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("detects a loopback server that exposes the VS Code health endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    try {
      await expect(discoverServerUrl()).resolves.toBe("http://127.0.0.1:8080");
      expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:8080/healthz", {
        redirect: "error",
        signal: expect.any(AbortSignal),
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
