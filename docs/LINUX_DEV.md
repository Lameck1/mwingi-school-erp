# Linux Development checklist — Mwingi School ERP

This short checklist helps set up a reliable Electron development flow on Ubuntu-like systems.

Prereqs

- Use Node.js v18+ (match project's engines if defined) and npm.
- Install system packages that Electron needs (X11 libs) when using native builds.

Dev flow

- Start renderer only: `npm run renderer:dev`
- Start the full Electron dev flow with X11 fallback: `npm run linux:dev`
- If Electron crashes under Wayland, use X11 flags provided by `electron-linux.sh` (QT_QPA_PLATFORM=xcb, --ozone-platform=x11).

Security / App config

- Keep `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true` for all renderers.
- Expose minimal APIs via `contextBridge` (the project uses `electron/preload` already).
- Register `will-navigate` and `setWindowOpenHandler` to block unexpected navigation/popups.
- Define a tight Content-Security-Policy in the main process (already configured in `electron/main/index.ts`).

Native modules

- Rebuild native addons for your Electron version:

```bash
npx electron-rebuild -f -w
# or use electron-builder helper
npx electron-builder install-app-deps
```

Packaging

- Use `electron-builder` to produce AppImage / deb formats on Linux. Use the project's existing `build` config.
- For CI builds, use the `electron-builder` Docker images or Ubuntu CI runners; run `install-app-deps` and `electron-rebuild` in CI before packaging.

Debug tips

- Enable verbose Electron logs when investigating: `ELECTRON_ENABLE_LOGGING=1 ELECTRON_ENABLE_STACK_DUMPING=1`.
- For transient GPU/Ozone crashes during dev, try `--disable-gpu`, `--use-gl=swiftshader`, or force X11.

Files/commands

- Launcher script: `electron-linux.sh` (project root) — use `npm run linux:dev` or `npm run linux:run`.
- Dev commands:

```bash
# Renderer
npm run renderer:dev
# Electron (dev + X11 fallback)
npm run linux:dev
```

Contact

- If you want, I can open a PR that adds this file to the repo root and updates CI steps.
