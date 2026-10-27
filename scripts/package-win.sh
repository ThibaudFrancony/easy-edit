#!/bin/zsh
# Construit l'installateur Windows x64 (« Easy Edit … Setup.exe ») depuis le Mac et le montre dans le Finder.
set -euo pipefail
cd "${0:A:h}/.."

STAGE="${TMPDIR:-/tmp}/easy-edit-build/windows"
rm -rf "$STAGE"
mkdir -p "$STAGE"

# ffmpeg-static ne télécharge que le binaire de la machine qui installe : on ajoute celui de Windows à côté (ffmpeg.exe).
npm_config_platform=win32 npm_config_arch=x64 node node_modules/ffmpeg-static/install.js

npx electron-vite build
npx electron-builder --win nsis --x64 -c.directories.output="$STAGE"

INSTALLER=$(ls "$STAGE"/*.exe | head -1)
echo "Construit : $INSTALLER"
open -R "$INSTALLER"
