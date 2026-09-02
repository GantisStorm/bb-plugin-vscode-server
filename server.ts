import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const configuredUrlSchema = z.object({
  url: z.string().url().nullable(),
});

export const rpcContract = defineRpcContract({
  vscode_server_url: {
    input: z.null(),
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

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    serverUrl: {
      type: "string",
      label: "VS Code Server URL",
      description: "The http(s) URL of code-server or VS Code Server. Overrides VSCODE_SERVER_URL.",
      default: "",
    },
  });

  bb.rpc.register(rpcContract, {
    vscode_server_url: async () => {
      const { serverUrl } = await settings.get();
      return {
        url: normalizeServerUrl(serverUrl) ?? normalizeServerUrl(process.env.VSCODE_SERVER_URL ?? ""),
      };
    },
  });
}
