# Easy Edit

Petit logiciel de montage vidéo maison pour macOS. Il sert uniquement sur le Mac de Thibaud et monte les clips produits par **ReplayClip** (son enregistreur d'écran « 30 dernières secondes »). On part du strict nécessaire et on ajoute des fonctions au fil des mois d'utilisation. Le nom est provisoire.

## Principes (à respecter à chaque changement)

- **La rapidité d'abord.** L'app ne doit jamais ramer, ni au lancement ni pendant le montage. Au démarrage on affiche seulement l'interface. Tout le travail lourd (lecture des fichiers, vignettes, formes d'onde, export) se fait en arrière-plan et ne bloque jamais le thread principal. Ce qu'on calcule, on le garde en cache.
- **Interface très animée : aucun changement brusque.** Chaque apparition, disparition ou changement de vue passe par un mouvement fluide. Une seule fenêtre : les panneaux glissent, rien ne s'ouvre en pop-up brutal. Les animations sont courtes (0,2 à 0,4 s, ressorts doux) et viennent de `src/renderer/src/lib/motion.ts` (bibliothèque Motion), pas de valeurs inventées sur place.
- « Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout. »
- « Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything. »
- **Professionnel mais simple.** Direction « Studio » (voir Design) : sombre, dense, sobre, dans l'esprit de DaVinci Resolve ou Premiere. Ni look Apple, ni style « site web ».
- **Rien qui trahisse une interface générée par IA.** Pas de dégradés, de lueurs, de néon, d'emoji, d'icône « étincelles », de cartes flottantes partout, de violet par défaut, de textes d'accroche. Un seul accent, des alignements nets, des espacements réguliers : un outil propre.
- **Montage non destructif.** Les clips d'origine ne sont jamais modifiés. Un projet décrit ce qu'on garde ; la vidéo n'est calculée qu'à l'export.

## Stack

- **Electron** (44) avec **electron-vite** (Vite 8) et **electron-builder**. Uniquement macOS, Apple Silicon.
- Interface : **React 19 + TypeScript** (strict), CSS Modules, **Motion** pour toutes les animations, **Zustand + Immer** pour l'état.
- **FFmpeg / FFprobe** fournis avec l'app (`ffmpeg-static`, `ffprobe-static`) : analyse des clips, vignettes, extraction des pistes audio, et bientôt formes d'onde, normalisation et export (encodeur matériel `h264_videotoolbox`).
- Aperçu : deux `<video>` sans son qui se relaient d'un clip à l'autre, calés sur l'horloge de la **Web Audio API**, qui joue les pistes audio (un gain par piste, jusqu'à 200 %).
- Les fichiers locaux sont servis à l'interface par le protocole `media://` (avec les requêtes Range, pour la recherche dans les vidéos).

## Format des clips d'entrée (ReplayClip)

- Dossier par défaut : `~/Movies/Clips`. Noms : `Clip du 21-10-2026 à 23h17m28.mp4` (ReplayClip peut aussi produire une version `… - compressé.mp4`).
- Vidéo : H.264 (`avc1`), taille de l'écran filmé (ex. 1728×1080), environ 60 i/s, cadence variable.
- Audio : AAC 48 kHz, **6 pistes** dans un même groupe de pistes alternatives :
  1. `Mix` : activée, c'est celle que jouent les lecteurs classiques ;
  2. `Micro`, `Minecraft`, `Discord`, `Autres sons` : désactivées, une par source.
- Le nom de chaque piste est dans une boîte `udta/titl` de chaque `trak` du MP4 : FFprobe ne la lit pas, `src/main/mp4.ts` la lit lui-même. Les versions « compressé » ont perdu ces noms : on retombe alors sur l'ordre ci-dessus.
- En montage, on utilise les pistes séparées (pas le Mix) pour régler chaque source indépendamment. Si un fichier n'a qu'une piste audio, on utilise celle-là.
- Le code de ReplayClip vit dans un dossier temporaire d'une ancienne session Claude (pas encore déplacé dans un vrai dossier). L'app installée est `/Applications/ReplayClip.app`.

## Interface

Une seule fenêtre, sombre :

- **À gauche, la bibliothèque** : les clips du dossier, avec une vignette et leur durée.
- **Au centre, l'aperçu** : le lecteur et les commandes de lecture.
- **À droite, l'inspecteur** (lot 3) : les réglages de la piste sélectionnée, qui glissent depuis la droite.
- **En bas, la timeline** : une ligne vidéo, puis une ligne par piste audio.
- **L'export** se fait dans un panneau qui glisse depuis le haut de la fenêtre (bouton « Exporter » de la barre du haut, ⌘E), pas dans une nouvelle fenêtre.
- Raccourcis comme dans les logiciels pros : Espace (lecture), J/K/L, ← → (image par image).

Les textes de l'interface sont en français.

## Design (direction « Studio »)

Choisie le 23/10/2026 parmi trois maquettes : https://claude.ai/artifact/FkhRjvGt4NuhDqtCiJRsgG (artboard « 1 · Studio »). Des panneaux collés les uns aux autres, séparés par des filets de 1 px, plutôt que des cartes flottantes.

| Rôle | Valeur |
|---|---|
| Fond de l'app | `#0B0C0F` |
| Panneaux (bibliothèque, inspecteur, barre du haut) | `#0F1014` |
| Fond des pistes | `#101216` |
| Survol / sélection | `#1A1D23` / `#1C2027` |
| Filets et bordures | `#1F2229`, contrôles `#23262E` |
| Texte / secondaire / discret | `#E8EAEE` / `#9AA0AB` / `#6B717C` |
| **Accent unique** (sélection, curseur de lecture, bouton principal, interrupteurs actifs) | `#FF6B2C`, texte posé dessus `#140904` |
| Morceaux vidéo | `#24324D` |
| Morceaux audio / forme d'onde | `#163129` / `#5FD8AE` |
| Fond sonore / forme d'onde | `#2A2342` / `#B9A2FF` |

- Polices : **Inter** pour l'interface (13 px de base, poids 400, 500 et 600), **JetBrains Mono** pour les minutages et les valeurs (« 0:19.12 », « 140 % »).
- Rayons : 7 px pour les contrôles, 8 px pour l'aperçu, 5 px pour les morceaux. Espacements sur une grille de 4 px.
- Hauteurs : barre du haut 48 px, piste vidéo 66 px, pistes audio 40 px, en-têtes de piste 128 px de large.
- Icônes : traits fins (2 px), arrondis, en `currentColor`. Pas de bibliothèque d'icônes « fantaisie ».

## Structure

```
src/
  shared/          types et opérations pures sur un projet (utilisés des deux côtés)
  main/            processus Node : fenêtre, menus, FFmpeg (media.ts), lecteur MP4 (mp4.ts),
                   protocole media:// (protocol.ts), fichiers projet (projects.ts),
                   export : commande FFmpeg (export.ts) et lancement avec progression (ffmpeg-run.ts)
  preload/         pont sécurisé : expose `window.api` (type `EasyEditAPI`)
  renderer/src/    interface React
    engine/        moteur de lecture (horloge, Web Audio), formes d'onde, mesure du niveau sonore
    state/         stores Zustand : projet (seule porte d'entrée des modifications), bibliothèque, timeline
    components/    Library, Preview, timeline/
    lib/           motion.ts (animations), format.ts
scripts/package.sh construit, signe et installe l'app
```

- Toute modification du montage passe par `useProject.getState().update(draft => …)` : elle est annulable (⌘Z) et enregistrée automatiquement. Les actions de montage (couper, supprimer, lier…) sont dans `state/editing.ts` ; la sélection et le glissé en cours dans `state/timeline.ts`.
- Les opérations sur un projet (`insertClip`, `splitAt`, `moveSegments`, `removeSegments`, `toggleLink`…) sont des fonctions pures dans `src/shared/project.ts`.
- Tous les raccourcis sont gérés dans `useKeyboard.ts`. Ceux du menu y sont affichés avec `registerAccelerator: false`, pour que S, ⌫ ou ⌘Z gardent leur rôle normal dans un champ de texte ; cliquer l'entrée de menu envoie une `MenuAction`.
- Les modifications successives d'un même réglage (un curseur qu'on glisse) passent un `mergeKey` à `update` : une seule étape d'annulation.
- Projets : `~/Movies/Easy Edit/Projets/*.easyedit` (JSON). Exports : `~/Movies/Easy Edit/Exports`. Caches (vignettes, pistes audio extraites) : `~/Library/Application Support/Easy Edit/Media`.

## Compiler et lancer

```
npm install
npm run dev          # l'app en développement, rechargement à chaud de l'interface
npm run typecheck    # vérification TypeScript
npm run app          # construit « Easy Edit.app » (signée localement)
npm run install-app  # construit, installe dans /Applications et lance
```

Le processus principal (`src/main`) n'est pas rechargé à chaud : relancer `npm run dev` après l'avoir modifié. Il n'y a pas encore de tests automatiques.

**Vérifier dans l'app (agents)** : `npm run dev -- --remoteDebuggingPort 9229`, puis piloter la page par le protocole DevTools (`http://127.0.0.1:9229/json/list`, `Runtime.evaluate`). En développement, `window.easyEdit` expose `player`, `useProject`, `useLibrary`, `useTimeline` et `editing` ; `Input.dispatchDragEvent` simule un glisser-déposer. La fenêtre continue de se mettre à jour même cachée (`backgroundThrottling: false`).

## Conventions

- Code, commentaires et messages en français ; noms de types et de fonctions en anglais.
- TypeScript strict, pas de `any`. Composants en fonctions, un fichier CSS Module par composant, couleurs uniquement via les variables de `styles.css`.
- Le travail lourd va dans le processus principal (FFmpeg) ou hors de React (moteur de lecture) ; ce qui bouge à chaque image (curseur, vidéo) est mis à jour directement, sans re-rendu React.
- Commentaires courts, seulement quand le « pourquoi » n'est pas évident.
- Après un changement : `npm run typecheck`, puis vérifier dans l'app.

## Feuille de route

Fait :
- lot 1 : projets, bibliothèque, aperçu et lecture de la timeline, glisser-déposer aimanté, zoom ;
- lot 2 : sélection, déplacement, coupe, suppression, liaison, annuler, formes d'onde ;
- lot 3 : inspecteur de piste, volume jusqu'à 200 %, fonds sonores, normalisation ;
- lot 4 : export .mp4.

La suite, et les décisions d'UI et d'UX déjà prises, sont dans [TODO.md](TODO.md). On avance lot par lot et on coche au fur et à mesure.

## Git

Dépôt public : https://github.com/ThibaudFrancony/easy-edit (branche `main`). On pousse à la fin de chaque lot.
