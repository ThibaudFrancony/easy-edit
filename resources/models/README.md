# Modèles

## `rife-v4.22-lite.onnx` (motion blur)

RIFE 4.22 lite, le réseau d'interpolation d'images de [Practical-RIFE](https://github.com/hzwer/Practical-RIFE) (licence MIT, © 2021 hzwer), converti au format ONNX par [vs-mlrt](https://github.com/AmusementClub/vs-mlrt) : archive `rife_v4.22_lite.7z` de la release [`external-models`](https://github.com/AmusementClub/vs-mlrt/releases/tag/external-models), variante `rife_v2/`.

- Entrée `input` : `[1, 7, hauteur, largeur]`, float32 de 0 à 1 : image A (R, V, B), image B (R, V, B), puis un plan rempli de l'instant `t` (de 0 à 1).
- Sortie `output` : `[1, 3, hauteur, largeur]`, l'image à l'instant `t`.
- SHA-256 : `2a1eca144923e6f5d9b10c07f8355883361ae378d67539e50bba1616effaa0cc`.

## `rife-v4.22-lite-cuda.onnx` (motion blur sur la carte NVIDIA du PC de rendu)

Le même réseau, entouré de quelques nœuds pour prendre et rendre des images en octets RGB, telles que FFmpeg les donne : quatre fois moins de données copiées vers la carte, plus de conversion en JavaScript, résultat identique. Fabriqué par `scripts/rife-cuda-model.py` ; n'est pas mis dans l'app Mac ni Windows (voir `extraResources` dans `package.json`).

- Entrées `img0`, `img1` : `[hauteur, largeur, 3]`, uint8 ; `timestep` : `[1]`, float32.
- Sortie `frame` : `[hauteur, largeur, 3]`, uint8.
- SHA-256 : `cb19ab70089d5c397dfd1a0e6f3d9c22c708e2dfaaa395f3358b223e3c8eb9b6`.
