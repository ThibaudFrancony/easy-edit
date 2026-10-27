# Easy Edit

Petit logiciel de montage vidéo maison pour macOS et Windows. Il sert sur le Mac de Thibaud et chez quelques amis (Mac M1 ou plus récent, Windows 11), et monte surtout les clips produits par **ReplayClip** (son enregistreur d'écran « 30 dernières secondes »). On part du strict nécessaire et on ajoute des fonctions au fil des mois d'utilisation. Le nom est provisoire.

## Principes (à respecter à chaque changement)

- **La rapidité d'abord.** L'app ne doit jamais ramer, ni au lancement ni pendant le montage. Au démarrage on affiche seulement l'interface. Tout le travail lourd (lecture des fichiers, vignettes, formes d'onde, export) se fait en arrière-plan et ne bloque jamais le thread principal. Ce qu'on calcule, on le garde en cache.
- **Interface très animée : aucun changement brusque.** Chaque apparition, disparition ou changement de vue passe par un mouvement fluide. Une seule fenêtre : les panneaux glissent, rien ne s'ouvre en pop-up brutal. Les animations sont courtes (0,2 à 0,4 s, ressorts doux) et viennent de `src/renderer/src/lib/motion.ts` (bibliothèque Motion), pas de valeurs inventées sur place.
- « Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout. »
- « Make the best decision that will elevate all three: the user experience (UX), developer experience (DX), and agent experience (AX) always, without breaking anything. »
- **Professionnel mais simple.** Direction « Studio » (voir Design) : sombre, dense, sobre, dans l'esprit de DaVinci Resolve ou Premiere. Ni look Apple, ni style « site web ».
- **Rien qui trahisse une interface générée par IA.** Pas de dégradés, de lueurs, de néon, d'emoji, d'icône « étincelles », de cartes flottantes partout, de violet par défaut, de textes d'accroche, ni de petit liseré coloré sur le bord d'un élément sélectionné (une sélection se montre par un fond gris `#1C2027`). Un seul accent, des alignements nets, des espacements réguliers : un outil propre.
- **Montage non destructif.** Les clips d'origine ne sont jamais modifiés. Un projet décrit ce qu'on garde ; la vidéo n'est calculée qu'à l'export.

## Stack

- **Electron** (44) avec **electron-vite** (Vite 8) et **electron-builder**. macOS (Apple Silicon) et Windows 11 (x64). Ce qui diffère d'un système à l'autre est dans `src/main/folders.ts` (dossiers), `src/main/export.ts` (encodeur), `src/main/index.ts` (fenêtre, menu) et `renderer/src/lib/platform.ts` (raccourcis, libellés).
- Interface : **React 19 + TypeScript** (strict), CSS Modules, **Motion** pour toutes les animations, **Zustand + Immer** pour l'état.
- **FFmpeg / FFprobe** fournis avec l'app (`ffmpeg-static`, `ffprobe-static`) : analyse des clips, vignettes, extraction des pistes audio, et bientôt formes d'onde, normalisation et export (encodeur matériel `h264_videotoolbox`).
- Aperçu : deux `<video>` sans son qui se relaient d'un clip à l'autre, calés sur l'horloge de la **Web Audio API**, qui joue les pistes audio (un gain par piste, jusqu'à 200 %).
- Les fichiers locaux sont servis à l'interface par le protocole `media://` (avec les requêtes Range, pour la recherche dans les vidéos).
- **Rendu sur le PC Linux** (lot 11) : l'export peut partir sur le PC de la maison (`whorespace`, GeForce GTX 1650), où tourne le service `src/render-server/` (Node seul, systemd). Il fait le même rendu que l'app, avec le même code.

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

- **À gauche, la bibliothèque « Fichiers »** : les vidéos (vignette, durée ; l'heure pour un clip de ReplayClip, le nom sinon), les images et les sons (forme d'onde, durée). Le + de l'en-tête importe des fichiers ; on peut aussi les glisser depuis le Finder ou l'Explorateur. Ils sont copiés dans `Easy Edit/Vidéos`, `Sons` ou `Images` ; un .mkv est converti en .mp4 sans réencodage.
- **Au centre, l'aperçu** : le lecteur et les commandes de lecture.
- **À droite, l'inspecteur** (lot 3) : les réglages de la piste sélectionnée, qui glissent depuis la droite.
- **En bas, la timeline** : les pistes vidéo (la plus haute passe par-dessus les autres dans l'image ; les sous-titres arrivent tout en haut), puis les pistes audio. L'ordre de `project.lanes` est l'ordre d'affichage.
- **Le menu « Plugins »** de la barre du haut (`components/PluginsMenu.tsx`, repris dans le menu de l'app) regroupe les outils optionnels : « Transcript », qui ouvre le choix des pistes à transcrire (`setPicking` dans `state/transcription.ts`), et « Motion blur », qui ouvre les réglages de flou de la piste vidéo dans l'inspecteur (`openMotionBlur` dans `state/editing.ts`).
- **L'export** se fait dans un panneau qui glisse depuis le haut de la fenêtre (bouton « Exporter » de la barre du haut, ⌘E), pas dans une nouvelle fenêtre.
- **Plein écran** (F) : l'aperçu remplit l'écran, commandes flottantes qui se cachent. **Deuxième écran** (⇧F) : seule exception à la fenêtre unique, une fenêtre sans bordure (`#monitor`, `components/Monitor.tsx`) qui recopie l'image ; elle suit le projet et l'horloge de la fenêtre principale (`state/screens.ts`, `player.follow`), qui garde le son.
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
- Logo « Lecture coupée » (choisi le 24/10/2026, logo C du canevas de design) : un triangle de lecture tranché, moitié gauche blanc cassé, moitié droite orange, sur une icône `#16181D`. Source : `resources/icon.svg` ; version sans fond pour l'interface : `components/Logo.tsx`.

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
resources/         icône de l'app : icon.svg (source), icon.icns et icon.png (générés par npm run icon) ;
                   polices (fonts/) et modèle RIFE du motion blur (models/)
  render-server/   service de rendu du PC Linux (Node seul) : HTTP (http.ts), file des rendus (jobs.ts)
scripts/package.sh construit, signe et installe l'app
scripts/render-server.sh  construit et installe le service de rendu sur le PC Linux
scripts/icon.mjs   génère l'icône à partir du SVG
```

- Toute modification du montage passe par `useProject.getState().update(draft => …)` : elle est annulable (⌘Z) et enregistrée automatiquement. Les actions de montage (couper, supprimer, lier…) sont dans `state/editing.ts` ; la sélection et le glissé en cours dans `state/timeline.ts`.
- Sous-titres : une piste vidéo qui porte un `look` (style et accent) et des morceaux `caption.words` (temps relatifs au morceau). Comme une image, un sous-titre a un `transform` (déplacer, redimensionner) mais pas de `crop` ; sa boîte, mesurée sur l'aperçu, est notée dans `onPreview` (`rect`). Les anciens projets (`kind: 'caption'`) sont convertis à l'ouverture par `upgradeProject`. Taille ASS = em de l'aperçu × 1,21 (hauteur de ligne d'Inter), car libass règle la taille sur la ligne et CSS sur l'em. Styles et découpage dans `src/shared/captions.ts`, partagés par l'aperçu (`components/Captions.tsx`, CSS) et l'export (`src/main/captions-ass.ts`, libass). Transcription : `engine/transcribe.ts` (Voz) et `state/transcription.ts`.
- Motion blur (`lane.motionBlur`, export seulement) : `src/shared/motion-blur.ts` choisit les instants à mélanger ; `src/main/motion-blur.ts` floute chaque morceau concerné avant l'export (fichier en cache `Media/motion-blur`) dans un processus à part, `motion-blur-worker.ts` (FFmpeg décode, RIFE interpole avec onnxruntime-node, FFmpeg réencode). Le modèle est `resources/models/rife-v4.22-lite.onnx` (provenance dans le README du dossier). Pour l'essayer sans Electron, le processus se lance dans Node avec un faux `process.parentPort`.
- L'export (`src/main/render.ts` : motion blur puis FFmpeg) ne dépend pas d'Electron : les dossiers et le lancement du processus de calcul sont réglés au démarrage par `configureRuntime` (`runtime.ts`), par l'app (`index.ts`) ou par le service de rendu. Ne pas importer `electron` ni `folders.ts` depuis `render.ts`, `export.ts`, `motion-blur.ts` ou `media-tools.ts`.
- Rendu à distance : protocole décrit dans `src/shared/render-protocol.ts`. Côté app, `render-client.ts` (envoi, suivi, réception, sans Electron) et `render-remote.ts` (découverte Bonjour, code d'appairage dans `render.json` du dossier de données de l'app, reprise des rendus finis). Données du service : `~/.local/share/easy-edit-render` (`config.json` : nom et code ; `files/`, `cache/`, `jobs/`).
- Le cadrage d'un morceau (`transform`, `crop`) se calcule dans `src/shared/geometry.ts` (`placement`), en fractions de l'image : la même fonction sert à l'aperçu (en %) et à l'export (en pixels). L'édition sur l'aperçu est dans `state/canvas.ts` et `components/FrameEditor.tsx`.
- Les opérations sur un projet (`insertClip`, `splitAt`, `moveSegments`, `removeSegments`, `toggleLink`…) sont des fonctions pures dans `src/shared/project.ts`.
- Tous les raccourcis sont gérés dans `useKeyboard.ts`. Ceux du menu y sont affichés avec `registerAccelerator: false`, pour que S, ⌫ ou ⌘Z gardent leur rôle normal dans un champ de texte ; cliquer l'entrée de menu envoie une `MenuAction`.
- Les modifications successives d'un même réglage (un curseur qu'on glisse) passent un `mergeKey` à `update` : une seule étape d'annulation.
- Tout est rangé dans le dossier Vidéos de l'utilisateur (`~/Movies` sur Mac) : projets `Easy Edit/Projets/*.easyedit` (JSON), exports `Easy Edit/Exports`, fichiers importés `Easy Edit/Vidéos`, `Sons` et `Images`. Caches (vignettes, pistes audio extraites) : dossier de données de l'app (`~/Library/Application Support/Easy Edit/Media` sur Mac).

## Compiler et lancer

```
npm install
npm run dev          # l'app en développement, rechargement à chaud de l'interface
npm run typecheck    # vérification TypeScript
npm run app          # construit « Easy Edit.app » (signée localement) dans $TMPDIR/easy-edit-build
npm run install-app  # construit, installe dans /Applications et lance
npm run app:win      # construit l'installateur Windows x64 (NSIS) depuis le Mac, dans $TMPDIR/easy-edit-build/windows
npm run icon         # régénère l'icône après une modification de resources/icon.svg
npm run render-server  # sur le PC Linux : construit et (ré)installe le service de rendu, affiche le code d'appairage
```

Aucune copie de l'app n'est laissée dans le projet (dossier indexé par Spotlight) : seule celle de /Applications existe après `install-app`.

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
- lot 4 : export .mp4 ;
- lot 5 : plusieurs pistes vidéo superposées, images à durée réglable ;
- lot 6 : bibliothèque par catégories, cadrage (redimensionner, rogner, déplacer sur l'aperçu) ;
- lot 7 : sous-titres automatiques (Voz), quatre styles, incrustés à l'export ;
- lot 8 : aperçu en plein écran et sur un deuxième écran.

La suite, et les décisions d'UI et d'UX déjà prises, sont dans [TODO.md](TODO.md). On avance lot par lot et on coche au fur et à mesure.

Les idées passent d'abord par [IDEES.md](IDEES.md). Quand Thibaud envoie des idées : les noter dans « En vrac », les regrouper en chantiers (une idée qui touche le même code ou le même geste qu'une autre va avec elle), poser les questions qui manquent, puis écrire le plan une fois les réponses connues. Un chantier validé devient le lot suivant de TODO.md.

## Git

Dépôt public : https://github.com/ThibaudFrancony/easy-edit (branche `main`). On pousse à la fin de chaque lot.
