#!/bin/zsh
# Construit « Easy Edit.app », signée localement (suffisant pour ce Mac). --install : la copie dans /Applications et la lance.
set -euo pipefail
cd "${0:A:h}/.."

# Tout se construit hors de Documents : ce dossier est synchronisé par iCloud (qui ajoute des attributs que codesign
# refuse) et indexé par Spotlight (chaque copie de l'app y apparaîtrait quand on cherche « Easy Edit »).
STAGE="${TMPDIR:-/tmp}/easy-edit-build"
APP="$STAGE/Easy Edit.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
rm -rf "$STAGE" dist
mkdir -p "$STAGE"

npx electron-vite build
npx electron-builder --mac dir --arm64 -c.directories.output="$STAGE/dist"

ditto --norsrc --noextattr --noacl "$STAGE/dist/mac-arm64/Easy Edit.app" "$APP"
rm -rf "$STAGE/dist"
codesign --force --deep --sign - "$APP"
# Une copie de travail ne doit jamais être proposée par macOS pour ouvrir l'app.
"$LSREGISTER" -u "$APP" 2>/dev/null || true
echo "Construite : $APP"

if [[ "${1:-}" == "--install" ]]; then
  osascript -e 'quit app "Easy Edit"' 2>/dev/null || true
  # Attendre la vraie fermeture, sinon `open` réveille l'ancienne instance au lieu de lancer la nouvelle.
  for _ in {1..50}; do pgrep -x "Easy Edit" >/dev/null || break; sleep 0.1; done
  rm -rf "/Applications/Easy Edit.app"
  ditto "$APP" "/Applications/Easy Edit.app"
  rm -rf "$STAGE"
  open "/Applications/Easy Edit.app"
  echo "Installée dans /Applications et lancée."
fi
