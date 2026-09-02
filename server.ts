import { cp, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const profileImportStatusSchema = z.object({
  sourceUserDataDirectory: z.string(),
  sourceExtensionsDirectory: z.string(),
  targetUserDataDirectory: z.string(),
  targetExtensionsDirectory: z.string(),
  importedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
});

const configuredUrlSchema = z.object({
  url: z.string().url().nullable(),
  profile: profileImportStatusSchema,
});

type ProfileImportStatus = z.infer<typeof profileImportStatusSchema>;

const loopbackCandidates = ["http://127.0.0.1:8080", "http://127.0.0.1:8000"];
const homeDirectory = homedir();

export const rpcContract = defineRpcContract({
  vscode_server_url: {
    input: z.object({ threadId: z.string().min(1).nullable() }),
    output: configuredUrlSchema,
  },
  discover_vscode_server_url: {
    input: z.object({ threadId: z.string().min(1).nullable() }),
    output: configuredUrlSchema,
  },
});

function normalizeServerUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  try {
    const url = new URL(trimmed);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function withWorkspaceFolder(serverUrl: string, workspacePath: string): string {
  const url = new URL(serverUrl);
  url.searchParams.set("folder", workspacePath);
  return url.toString();
}

function isLoopbackUrl(url: string): boolean {
  const hostname = new URL(url).hostname;
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

function normalizeDirectory(value: string): string {
  return resolve(value.trim());
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function discoverServerUrl(): Promise<string | null> {
  for (const url of loopbackCandidates) {
    try {
      const response = await fetch(`${url}/healthz`, {
        redirect: "error",
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return url;
    } catch {}
  }
  return null;
}

export async function discoverAndStoreServerUrl(
  storeServerUrl: (url: string) => Promise<void>,
): Promise<string | null> {
  const url = await discoverServerUrl();
  if (url !== null) await storeServerUrl(url);
  return url;
}

function createProfileStatus(
  sourceUserDataDirectory: string,
  sourceExtensionsDirectory: string,
  targetUserDataDirectory: string,
  targetExtensionsDirectory: string,
): ProfileImportStatus {
  return {
    sourceUserDataDirectory,
    sourceExtensionsDirectory,
    targetUserDataDirectory,
    targetExtensionsDirectory,
    importedAt: null,
    error: null,
  };
}

export async function importLocalProfile(
  url: string,
  profile: ProfileImportStatus,
): Promise<ProfileImportStatus> {
  if (!isLoopbackUrl(url)) {
    return {
      ...profile,
      error: "Profile import is available only for a local VS Code Server URL.",
    };
  }

  if (
    !(await isDirectory(profile.sourceUserDataDirectory)) ||
    !(await isDirectory(profile.sourceExtensionsDirectory))
  ) {
    return {
      ...profile,
      error: "The configured desktop VS Code profile or extensions directory was not found.",
    };
  }

  try {
    await cp(profile.sourceUserDataDirectory, resolve(profile.targetUserDataDirectory, "User"), {
      recursive: true,
      force: true,
    });
    await cp(profile.sourceExtensionsDirectory, profile.targetExtensionsDirectory, {
      recursive: true,
      force: true,
    });
    return { ...profile, importedAt: new Date().toISOString(), error: null };
  } catch (cause) {
    return {
      ...profile,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    serverUrl: {
      type: "string",
      label: "VS Code Server URL",
      description:
        "The http(s) URL of code-server or VS Code Server. Saving a local URL imports the configured desktop profile. Overrides VSCODE_SERVER_URL.",
      default: "",
    },
    autoCaptureLocalServer: {
      type: "boolean",
      label: "Capture local server",
      description:
        "Turn on to detect code-server or VS Code Server on ports 8080 and 8000 and save the first healthy endpoint. Turn off to clear the server URL captured by this switch.",
      default: false,
    },
    sourceUserDataDirectory: {
      type: "string",
      label: "Desktop VS Code profile",
      description: "The desktop VS Code User directory to import after a local server URL is configured.",
      default: resolve(homeDirectory, "Library/Application Support/Code/User"),
    },
    sourceExtensionsDirectory: {
      type: "string",
      label: "Desktop VS Code extensions",
      description: "The desktop VS Code extensions directory to import after a local server URL is configured.",
      default: resolve(homeDirectory, ".vscode/extensions"),
    },
    targetUserDataDirectory: {
      type: "string",
      label: "code-server profile",
      description: "The code-server user-data directory that receives the imported VS Code profile.",
      default: resolve(homeDirectory, ".local/share/code-server"),
    },
    targetExtensionsDirectory: {
      type: "string",
      label: "code-server extensions",
      description: "The code-server extensions directory that receives the imported VS Code extensions.",
      default: resolve(homeDirectory, ".local/share/code-server/extensions"),
    },
  });

  const getProfile = async (): Promise<ProfileImportStatus> => {
    const configured = await settings.get();
    return createProfileStatus(
      normalizeDirectory(configured.sourceUserDataDirectory),
      normalizeDirectory(configured.sourceExtensionsDirectory),
      normalizeDirectory(configured.targetUserDataDirectory),
      normalizeDirectory(configured.targetExtensionsDirectory),
    );
  };
  const getResponse = async (threadId: string | null) => {
    const { serverUrl } = await settings.get();
    const url = normalizeServerUrl(serverUrl) ?? normalizeServerUrl(process.env.VSCODE_SERVER_URL ?? "");
    const profile = await getProfile();
    const storedProfile = await bb.storage.kv.get<ProfileImportStatus>("profile-import");
    if (url === null || threadId === null) return { url, profile: storedProfile ?? profile };

    const thread = await bb.sdk.threads.get({ threadId });
    const workspacePath =
      thread.environmentId === null
        ? (await bb.sdk.threads.storageLocation({ threadId })).storageRootPath
        : (await bb.sdk.environments.get({ environmentId: thread.environmentId })).path ??
          (await bb.sdk.threads.storageLocation({ threadId })).storageRootPath;
    return { url: withWorkspaceFolder(url, workspacePath), profile: storedProfile ?? profile };
  };
  let activeImport: Promise<ProfileImportStatus> | null = null;
  let activeImportKey: string | null = null;
  const importProfile = async (url: string): Promise<ProfileImportStatus> => {
    const profile = await getProfile();
    const importKey = `${url}\n${profile.sourceUserDataDirectory}\n${profile.sourceExtensionsDirectory}\n${profile.targetUserDataDirectory}\n${profile.targetExtensionsDirectory}`;
    if (activeImport !== null && activeImportKey === importKey) return activeImport;

    activeImportKey = importKey;
    activeImport = importLocalProfile(url, profile).then(async (result) => {
      await bb.storage.kv.set("profile-import", result);
      return result;
    });
    try {
      return await activeImport;
    } finally {
      activeImport = null;
      activeImportKey = null;
    }
  };

  const storeCapturedServerUrl = async (serverUrl: string): Promise<void> => {
    await bb.storage.kv.set("captured-server-url", serverUrl);
    await settings.experimental_set({ serverUrl });
  };

  const clearCapturedServerUrl = async (serverUrl: string): Promise<void> => {
    const capturedServerUrl = await bb.storage.kv.get<string>("captured-server-url");
    await bb.storage.kv.delete("captured-server-url");
    if (capturedServerUrl === normalizeServerUrl(serverUrl)) {
      await settings.experimental_set({ serverUrl: "" });
    }
  };

  settings.onChange((next, previous) => {
    if (next.autoCaptureLocalServer && !previous.autoCaptureLocalServer) {
      void discoverAndStoreServerUrl(storeCapturedServerUrl);
    }
    if (!next.autoCaptureLocalServer && previous.autoCaptureLocalServer) {
      void clearCapturedServerUrl(next.serverUrl);
    }
    if (
      next.serverUrl === previous.serverUrl &&
      next.sourceUserDataDirectory === previous.sourceUserDataDirectory &&
      next.sourceExtensionsDirectory === previous.sourceExtensionsDirectory &&
      next.targetUserDataDirectory === previous.targetUserDataDirectory &&
      next.targetExtensionsDirectory === previous.targetExtensionsDirectory
    ) {
      return;
    }
    const url = normalizeServerUrl(next.serverUrl);
    if (url !== null) void importProfile(url);
  });

  bb.rpc.register(rpcContract, {
    vscode_server_url: ({ threadId }) => getResponse(threadId),
    discover_vscode_server_url: async ({ threadId }) => {
      const url = await discoverAndStoreServerUrl(storeCapturedServerUrl);
      if (url !== null) await importProfile(url);
      return getResponse(threadId);
    },
  });
}
