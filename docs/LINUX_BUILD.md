# Linux Build & Deployment Guide

## Overview

The Mwingi School ERP application is built with Electron and includes Windows-specific configurations that require adjustments for Linux compatibility.

## Key Linux Compatibility Changes

### 1. **Platform-Specific Icons**

- **Windows/macOS**: Uses `.ico` files
- **Linux**: Uses `.png` files for better compatibility
- Implemented in `electron/main/index.ts` - automatically selects the correct icon based on `process.platform`

### 2. **Window Rendering**

- **Issue**: Wayland causes Electron to crash with SIGSEGV (segmentation fault)
- **Solution**: Force X11 backend using `--ozone-platform=x11` flag
- This prevents crashes during window creation

### 3. **Window Configuration**

- `titleBarStyle` is now macOS-only
- X/Y window position settings are platform-aware to avoid issues on Linux
- Ensures proper window initialization across platforms

## Running on Linux

### Quick Start

```bash
# Build the application
npm run build:vite

# Run using the provided Linux launcher script
./electron-linux.sh
```

### Alternative: Manual Launch

```bash
# Set display and platform
export DISPLAY=:0
export QT_QPA_PLATFORM=xcb

# Run with X11 and GPU disabled
./node_modules/.bin/electron \
    dist-electron/main/index.js \
    --disable-gpu \
    --ozone-platform=x11 \
    --no-sandbox
```

### Development Mode (with hot reload)

```bash
./electron-linux.sh dev
```

## Environment Variables

- `DISPLAY` - X11 display socket (default: `:0`)
- `QT_QPA_PLATFORM=xcb` - Force X11 platform
- `ELECTRON_OZONE_PLATFORM_HINT=x11` - Suggest X11 to Electron

## Required Dependencies

### Ubuntu/Debian

```bash
# X11 libraries (usually pre-installed)
sudo apt-get install xorg libx11-6

# For building native modules
sudo apt-get install build-essential python3
```

### Fedora/RHEL

```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install libX11-devel
```

## Troubleshooting

### Segmentation Fault (SIGSEGV)

- **Cause**: Usually Wayland display server
- **Solution**: Ensure `--ozone-platform=x11` is used
- Check: `echo $WAYLAND_DISPLAY` should be empty/unset

### Blank/White Window

- Ensure X11 is properly configured
- Try: `DISPLAY=:0 xhost +local:` to allow local connections

### Missing Libraries

```bash
ldd ./node_modules/electron/dist/electron | grep "not found"
```

### GPU Issues

- Use `--disable-gpu` flag (included in electron-linux.sh by default)
- Alternative: Use `--use-gl=swiftshader` for software rendering

## Building for Distribution

```bash
npm run build:vite
npx electron-builder --linux deb AppImage
```

This will create:

- `.deb` package for Debian-based systems
- `.AppImage` universal Linux package

## Notes

- The application will run slower without GPU acceleration but maintains stability
- Wayland support may be available in future Electron versions
- All database files are stored in `~/.config/Electron/` on Linux
