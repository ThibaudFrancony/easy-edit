#!/bin/zsh
# Construit « Easy Edit.app », signée localement (suffisant pour ce Mac). --install : la copie dans /Applications et la lance.
set -euo pipefail
cd "${0:A:h}/.."

npx electron-vite build
npx electron-builder --mac dir --arm64

# Le dossier Documents est synchronisé par iCloud, qui ajoute des attributs que codesign refuse :
# on signe une copie propre, hors de Documents.
STAGE="${TMPDIR:-/tmp}/easy-edit-build"
APP="$STAGE/Easy Edit.app"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto --norsrc --noextattr --noacl "dist/mac-arm64/Easy Edit.app" "$APP"
codesign --force --deep --sign - "$APP"
echo "Construite : $APP"

if [[ "${1:-}" == "--install" ]]; then
  osascript -e 'quit app "Easy Edit"' 2>/dev/null || true
  # Attendre la vraie fermeture, sinon `open` réveille l'ancienne instance au lieu de lancer la nouvelle.
  for _ in {1..50}; do pgrep -x "Easy Edit" >/dev/null || break; sleep 0.1; done
  rm -rf "/Applications/Easy Edit.app"
  ditto "$APP" "/Applications/Easy Edit.app"
  open "/Applications/Easy Edit.app"
  echo "Installée dans /Applications et lancée."
fi
