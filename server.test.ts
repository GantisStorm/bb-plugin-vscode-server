import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin, { discoverAndStoreServerUrl, discoverServerUrl, importLocalProfile, withWorkspaceFolder } from "./server";

describe("VS Code Server configuration", () => {
  it("normalizes a configured server URL before exposing it to the panel", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: { serverUrl: "http://127.0.0.1:8080/" },
    });
    await plugin(bb);

    await expect(harness.behavior.callRpc("vscode_server_url", { threadId: null })).resolves.toMatchObject({
      url: "http://127.0.0.1:8080",
      profile: {
        importedAt: null,
        error: null,
      },
    });
  });

  it("keeps the panel unconfigured when no explicit URL or environment fallback exists", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: { serverUrl: "" },
    });
    await plugin(bb);

    await expect(harness.behavior.callRpc("vscode_server_url", { threadId: null })).resolves.toMatchObject({
      url: null,
      profile: {
        importedAt: null,
        error: null,
      },
    });
  });

  it("opens the server at the selected workspace folder", () => {
    expect(withWorkspaceFolder("http://127.0.0.1:8080", "/work/project")).toBe(
      "http://127.0.0.1:8080/?folder=%2Fwork%2Fproject",
    );
  });


  it("captures and saves a local server when the settings toggle is enabled", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: { serverUrl: "" },
    });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    try {
      await plugin(bb);
      await harness.behavior.setSettings({ autoCaptureLocalServer: true });
      await vi.waitFor(async () => {
        await expect(
          harness.behavior.callRpc("vscode_server_url", { threadId: null }),
        ).resolves.toMatchObject({ url: "http://127.0.0.1:8080" });
      });
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("imports a local desktop profile into the configured code-server directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "vscode-server-profile-"));
    const sourceUserDataDirectory = join(root, "Code", "User");
    const sourceExtensionsDirectory = join(root, "extensions");
    const targetUserDataDirectory = join(root, "code-server");
    const targetExtensionsDirectory = join(targetUserDataDirectory, "extensions");

    try {
      await mkdir(sourceUserDataDirectory, { recursive: true });
      await mkdir(sourceExtensionsDirectory, { recursive: true });
      await writeFile(join(sourceUserDataDirectory, "settings.json"), '{"workbench.colorTheme":"Dark Modern"}');
      await writeFile(join(sourceExtensionsDirectory, "theme.txt"), "extension");

      const result = await importLocalProfile("http://127.0.0.1:8080", {
        sourceUserDataDirectory,
        sourceExtensionsDirectory,
        targetUserDataDirectory,
        targetExtensionsDirectory,
        importedAt: null,
        error: null,
      });

      expect(result).toMatchObject({ error: null });
      await expect(readFile(join(targetUserDataDirectory, "User", "settings.json"), "utf8")).resolves.toBe(
        '{"workbench.colorTheme":"Dark Modern"}',
      );
      await expect(readFile(join(targetExtensionsDirectory, "theme.txt"), "utf8")).resolves.toBe("extension");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("imports the configured profile when a URL is saved in plugin settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "vscode-server-settings-"));
    const sourceUserDataDirectory = join(root, "Code", "User");
    const sourceExtensionsDirectory = join(root, "extensions");
    const targetUserDataDirectory = join(root, "code-server");
    const targetExtensionsDirectory = join(targetUserDataDirectory, "extensions");
    const { bb, harness } = createFakePluginHost({
      pluginId: "vscode-server",
      settings: {
        serverUrl: "",
        sourceUserDataDirectory,
        sourceExtensionsDirectory,
        targetUserDataDirectory,
        targetExtensionsDirectory,
      },
    });

    try {
      await mkdir(sourceUserDataDirectory, { recursive: true });
      await mkdir(sourceExtensionsDirectory, { recursive: true });
      await writeFile(join(sourceUserDataDirectory, "settings.json"), '{"editor.minimap.enabled":false}');
      await plugin(bb);
      await harness.behavior.setSettings({ serverUrl: "http://127.0.0.1:8080" });

      await vi.waitFor(async () => {
        await expect(readFile(join(targetUserDataDirectory, "User", "settings.json"), "utf8")).resolves.toBe(
          '{"editor.minimap.enabled":false}',
        );
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
