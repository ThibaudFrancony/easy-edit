#!/usr/bin/env bash
# Construit et (ré)installe le service de rendu sur le PC Linux : un service systemd du compte de l'utilisateur,
# lancé depuis ce dépôt. À relancer après un `git pull` pour mettre le service à jour.
set -euo pipefail
cd "$(dirname "$0")/.."

DATA="${XDG_DATA_HOME:-$HOME/.local/share}/easy-edit-render"
CUDA="$DATA/cuda/lib"
NVIDIA=https://developer.download.nvidia.com/compute

# Le moteur CUDA d'onnxruntime (téléchargé à part ; un `npm install` l'efface).
if [ ! -f node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime_providers_cuda.so ]; then
  node node_modules/onnxruntime-node/script/install.js --onnxruntime-node-install=cuda12
fi
# FFmpeg pour Linux (absent si les dépendances ont été installées sans leurs scripts).
[ -x node_modules/ffmpeg-static/ffmpeg ] || node node_modules/ffmpeg-static/install.js

# CUDA 13.2 et cuDNN 9 (environ 2 Go), dans le dossier du service : rien n'est installé dans le système.
if [ ! -f "$CUDA/libcudnn.so.9" ]; then
  mkdir -p "$CUDA" "$DATA/cuda/archives"
  (
    cd "$DATA/cuda/archives"
    for path in \
      cuda/redist/cuda_cudart/linux-x86_64/cuda_cudart-linux-x86_64-13.2.86-archive.tar.xz \
      cuda/redist/libcublas/linux-x86_64/libcublas-linux-x86_64-13.4.1.3-archive.tar.xz \
      cuda/redist/libcufft/linux-x86_64/libcufft-linux-x86_64-12.2.0.57-archive.tar.xz \
      cuda/redist/libcurand/linux-x86_64/libcurand-linux-x86_64-10.4.2.66-archive.tar.xz \
      cudnn/redist/cudnn/linux-x86_64/cudnn-linux-x86_64-9.27.0.42_cuda13-archive.tar.xz; do
      curl -fL --progress-bar -O "$NVIDIA/$path"
    done
    for archive in *.tar.xz; do tar -xJf "$archive" --wildcards --strip-components=2 -C "$CUDA" '*/lib/*.so*'; done
  )
  rm -rf "$DATA/cuda/archives"
fi

npx vite build --config render-server.vite.config.ts

mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/easy-edit-render.service <<EOF
[Unit]
Description=Easy Edit Render (exports envoyés par l'app du Mac)
After=network-online.target

[Service]
WorkingDirectory=$PWD
ExecStart=$(command -v node) out/render-server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable easy-edit-render >/dev/null
systemctl --user restart easy-edit-render

echo "Service de rendu installé. Code d'appairage : $(node out/render-server/index.js --code)"
if [ "$(loginctl show-user "$USER" -p Linger --value)" != "yes" ]; then
  echo "Pour qu'il démarre avec le PC, sans ouvrir de session : sudo loginctl enable-linger $USER"
fi
echo "Pare-feu, une fois : sudo ufw allow from 192.168.1.0/24 to any port 7171 proto tcp && sudo ufw allow from 192.168.1.0/24 to any port 5353 proto udp"
