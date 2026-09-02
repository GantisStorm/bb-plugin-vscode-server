import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";

type UrlState =
  | { kind: "loading" }
  | { kind: "detecting" }
  | { kind: "ready"; url: string }
  | { kind: "missing" }
  | { kind: "error"; message: string };

function VsCodeServerPanel() {
  const rpc = useRpc<typeof rpcContract>();
  const [state, setState] = useState<UrlState>({ kind: "loading" });

  const load = useCallback(() => {
    setState({ kind: "loading" });
    rpc.call("vscode_server_url").then(
      ({ url }) => setState(url === null ? { kind: "missing" } : { kind: "ready", url }),
      (cause) =>
        setState({
          kind: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    );
  }, [rpc]);

  const discover = useCallback(() => {
    setState({ kind: "detecting" });
    rpc.call("discover_vscode_server_url").then(
      ({ url }) => setState(url === null ? { kind: "missing" } : { kind: "ready", url }),
      (cause) =>
        setState({
          kind: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    );
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "ready") {
    return (
      <iframe
        title="VS Code Server"
        src={state.url}
        className="h-full w-full border-0 bg-background"
        allow="clipboard-read; clipboard-write; fullscreen"
        referrerPolicy="no-referrer"
      />
    );
  }

  const detail =
    state.kind === "missing"
      ? "Set VS Code Server URL in this plugin’s settings, set VSCODE_SERVER_URL for BB’s server process, or detect a local server on port 8080 or 8000."
      : state.kind === "error"
        ? state.message
        : state.kind === "detecting"
          ? "Detecting a local VS Code Server…"
          : "Loading VS Code Server configuration…";

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-foreground">VS Code Server</h2>
          <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
        </div>
        {state.kind === "loading" || state.kind === "detecting" ? null : state.kind === "missing" ? (
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={discover}
          >
            Detect local server
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={load}
          >
            Reload configuration
          </button>
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  let nextPanelNumber = 1;

  app.slots.threadPanelAction({
    id: "vscode-server",
    title: "Open VS Code Server",
    icon: "Code2",
    component: VsCodeServerPanel,
    layout: "flush",
    run: ({ openPanel }) => {
      const panelNumber = nextPanelNumber++;
      openPanel({ title: `VS Code ${panelNumber}`, params: { panelNumber } });
    },
  });
  app.slots.experimental_newThreadPanelAction({
    id: "vscode-server",
    title: "Open VS Code Server",
    icon: "Code2",
    component: VsCodeServerPanel,
    layout: "flush",
    run: ({ openPanel }) => {
      const panelNumber = nextPanelNumber++;
      openPanel({ title: `VS Code ${panelNumber}`, params: { panelNumber } });
    },
  });
});
