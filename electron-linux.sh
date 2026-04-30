#!/bin/bash

# Mwingi School ERP - Linux Electron Launcher
# This script configures Electron to work properly on Linux systems
# It forces X11 instead of Wayland to avoid rendering crashes

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

set -euo pipefail

# Set environment variables for X11
export QT_QPA_PLATFORM=xcb
export DISPLAY="${DISPLAY:-:0}"

ELECTRON_FLAGS=(
    --disable-gpu
    --ozone-platform=x11
    --no-sandbox
    --enable-logging
)

VITE_URL="http://127.0.0.1:5173"

wait_for_vite() {
    local attempt=0
    while [ "$attempt" -lt 60 ]; do
        if curl -fsS "$VITE_URL" >/dev/null 2>&1; then
            return 0
        fi

        if ! kill -0 "$VITE_PID" >/dev/null 2>&1; then
            echo "Error: Vite dev server exited before Electron started."
            exit 1
        fi

        attempt=$((attempt + 1))
        sleep 1
    done

    echo "Error: Vite dev server did not become ready at $VITE_URL"
    exit 1
}

# Parse arguments
if [ "$1" == "dev" ]; then
    # Start the renderer dev server, wait for it, then launch Electron
    npm run renderer:dev > "$SCRIPT_DIR/.vite-linux.log" 2>&1 &
    VITE_PID=$!

    cleanup() {
        if kill -0 "$VITE_PID" >/dev/null 2>&1; then
            kill "$VITE_PID" >/dev/null 2>&1 || true
        fi
    }
    trap cleanup EXIT INT TERM

    wait_for_vite
    VITE_DEV_SERVER_URL="$VITE_URL" ./node_modules/.bin/electron \
        ./dist-electron/main/index.js \
        "${ELECTRON_FLAGS[@]}"
elif [ "$1" == "build" ]; then
    # Build the app
    npm run build:vite
elif [ -n "$1" ]; then
    # Custom command
    "$@"
else
    # Run the built app
    if [ -f "./dist-electron/main/index.js" ]; then
        ./node_modules/.bin/electron \
            ./dist-electron/main/index.js \
            "${ELECTRON_FLAGS[@]}"
    else
        echo "Error: dist-electron/main/index.js not found. Run 'npm run build:vite' first."
        exit 1
    fi
fi
