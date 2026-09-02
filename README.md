# VS Code Server for BB

Embed a self-hosted [code-server](https://github.com/coder/code-server) or VS Code Server instance in BB's right panel. Each launch opens an independent `VS Code 1`, `VS Code 2`, and so on tab.

## Requirements

- BB 0.41 or later.
- A reachable HTTP or HTTPS code-server or VS Code Server URL.
- The server's authentication and network controls must permit the BB client that will load it.

## Install

Install from the plugin's Git repository after its first release:

```sh
bb plugin install git:https://github.com/GantisStorm/bb-plugin-vscode-server.git@semver:^0.1.0
```

## Configure

Set the URL in BB settings:

```sh
bb plugin config vscode-server set serverUrl https://code.example.com
```

Alternatively, set `VSCODE_SERVER_URL` in BB's server environment. The plugin setting takes precedence. Empty settings and environment values leave the panel unconfigured.

The plugin settings also show the desktop VS Code profile and extension directories, plus the code-server target directories. Saving a loopback URL in the setting—or using **Detect local server**—imports the selected profile and extensions into those target directories. Start code-server with matching `--user-data-dir` and `--extensions-dir` options. Remote URLs embed normally but cannot receive files from this machine. The URL must be absolute HTTP or HTTPS and must not contain credentials; the plugin removes a trailing slash before embedding it.

## Use

In any thread, open the right panel, choose **Open new tab**, then select **Open VS Code Server**. Each invocation creates a separately named tab. The panel reloads its configuration when opened; use **Reload configuration** after changing the setting while it is already open. When no URL is configured, **Detect local server** probes the standard local VS Code Server and code-server health endpoints on ports 8080 and 8000, saves the first healthy endpoint in the plugin setting, and imports the configured local profile. **Open in Browser** delegates the URL to BB’s native Browser, whose tabs remain available across thread navigation.

## Development

```sh
npm install
bb plugin build
npx vitest run server.test.ts
bb plugin install .
```

`dist/` is committed because Git installations load the prebuilt plugin artifacts. `bb plugin types` synchronizes development declarations with the BB instance used for development; the checked-in SDK declaration version is the latest published package compatible with the plugin's declared BB runtime requirement.

## Security

The plugin embeds the configured URL in an iframe and copies local profile files only for loopback URLs. It does not proxy requests or weaken the server's existing authentication. Configure code-server with HTTPS and its normal authentication controls when it is accessible outside a trusted network.

## License

[MIT](LICENSE)
