# Idées

Le tri avant [TODO.md](TODO.md). Une idée passe par trois étapes :

1. **En vrac** : Thibaud la note telle qu'elle vient, une ligne suffit.
2. **Chantiers** : Claude regroupe les idées qui vont ensemble, pose ses questions, puis écrit un plan une fois les réponses connues.
3. **Lot** : un chantier dont le plan est validé devient le prochain lot de TODO.md et quitte ce fichier.

Les questions sont numérotées (Q1, Q2…) d'un chantier à l'autre : on peut répondre « Q3 : oui » dans la conversation, et la réponse part dans les décisions du chantier.

## En vrac

- Réordonner les pistes en les glissant.
- Fondus audio et vidéo.
- Normalisation plus fidèle (pondération K des LUFS) et calcul dans un worker si les projets deviennent longs.

## Chantiers

Ordre revu le 24/10/2026 (priorité : envoyer une v1 à un pote sur Windows) :

1. Plein écran de l'aperçu (lot 8)
2. Windows, avec l'import de vidéos de « Clips venant d'ailleurs » (sans lui, la bibliothèque du pote est vide)
3. Partage et mises à jour : Windows d'abord, puis Mac ; publication de la 1.0
4. Étalonnage, mode simple
5. Clips venant d'ailleurs : le format de la vidéo (Q21)
6. Étalonnage, mode pro
7. Qualité de l'aperçu

### Étalonnage des couleurs

**État** : prêt
**Idées** : une option pour étalonner les couleurs, en mode simple et en mode pro avec tout.
**Taille** : moyen (simple), gros (pro, en deux lots) · **Dépend de** : rien.

**Décisions**
- Le réglage porte sur une **piste** vidéo entière.
- On le règle dans l'inspecteur, comme le volume d'une piste audio : un clic sur le nom de la piste vidéo l'ouvre, et la partie « Couleurs » y apparaît, avec un sélecteur Simple · Pro. Passer de l'un à l'autre garde les réglages.
- Comparer avant/après, deux façons :
  - maintenir B : l'aperçu montre l'image d'origine tant que la touche est enfoncée ;
  - bouton « Comparer » dans la barre de lecture : un volet vertical qu'on fait glisser sur l'aperçu, avec l'original à gauche et le résultat à droite.
- Mode simple : exposition, contraste, saturation, température, teinte.
- Mode pro, tout :
  - roues (ombres, tons moyens, hautes lumières) ;
  - courbes (générale et rouge, vert, bleu) ;
  - réglages par gamme de couleur (teinte, saturation, luminosité d'une seule couleur) ;
  - import de LUT `.cube` ;
  - préréglages enregistrés et réutilisables d'un projet à l'autre.
- Aperçu et export donnent exactement la même image : les réglages produisent une table de couleurs (LUT 3D) calculée dans `src/shared`. L'aperçu l'applique par WebGL, l'export par le filtre `lut3d` de FFmpeg. Tous les outils du mode pro tiennent dans cette même table : le mode pro ne change pas l'architecture.
- Une piste sans réglage n'est pas recalculée (aucun coût).

**Plan : mode simple (lot à venir)**
1. `src/shared/color.ts` : réglages d'une piste et calcul de la LUT 3D (33³ points).
2. Aperçu : chaque piste vidéo réglée est dessinée dans un canvas WebGL qui applique la LUT ; une piste sans réglage garde son `<video>` tel quel.
3. Export : la LUT est écrite en `.cube` dans le dossier temporaire et appliquée par `lut3d` à la piste avant sa superposition.
4. Inspecteur : partie « Couleurs » avec curseurs (double-clic pour revenir à zéro, `mergeKey` pour une seule étape d'annulation).
5. Comparaison : B maintenu, puis le volet « Comparer » (le shader reçoit la position du volet).

**Plan : mode pro, première partie**
1. Roues : trois disques (ombres, tons moyens, hautes lumières), chacun avec un point qu'on tire pour la teinte et un curseur pour la luminosité. Double-clic pour remettre à zéro.
2. Courbes : un graphique carré, des points qu'on ajoute d'un clic, qu'on tire, et qu'on retire d'un double-clic ; onglets Général · R · V · B.

**Plan : mode pro, seconde partie**
1. Gammes de couleur : six pastilles (rouges, jaunes, verts, cyans, bleus, magentas) avec trois curseurs chacune.
2. LUT `.cube` : importée (copiée dans `Easy Edit/LUT`), appliquée avant ou après les autres réglages, avec un curseur d'intensité.
3. Préréglages : « Enregistrer comme préréglage » garde tous les réglages d'une piste sous un nom ; une liste dans l'inspecteur les applique à une autre piste, en une étape d'annulation.

**Fichiers touchés** : `src/shared/color.ts`, `components/Preview.tsx`, `components/Inspector.tsx` (et des composants pour les roues et les courbes), `src/main/export.ts`, `useKeyboard.ts`.

### Clips venant d'ailleurs

**État** : à clarifier (Q21)
**Idées** : tes potes n'ont pas ReplayClip ; clips de tailles différentes dans un même montage (repris de « Plus tard »).
**Taille** : moyen · **Dépend de** : rien. Nécessaire avant d'envoyer l'app.

Aujourd'hui, la bibliothèque ne lit que `~/Movies/Clips`, et l'aperçu prend le format du premier clip. Les vidéos d'un téléphone, d'OBS ou de Windows ont d'autres tailles, d'autres cadences, une seule piste audio (déjà géré) ou plusieurs pistes sans nom.

**Décisions**
- Les vidéos s'ajoutent à la bibliothèque comme les sons (glisser, ou +) et sont **copiées** dans `Easy Edit/Vidéos`. La copie se fait en arrière-plan, avec sa progression sur la vignette ; le clip est utilisable dès qu'elle est finie.
- Le dossier de ReplayClip (`~/Movies/Clips`) reste lu tel quel, sans copie, s'il existe.
- Plusieurs pistes audio sans nom deviennent « Piste 1 », « Piste 2 »…
- Le format de la vidéo finale se choisit dans le panneau d'export. Il est présélectionné sur le format de l'aperçu (celui du premier clip par défaut). Un clip d'une autre taille s'ajuste dans l'image sans être déformé (bandes noires) ; le cadrage permet ensuite de le recadrer.

**Questions**
- Q21. Si l'export propose un autre format que celui de l'aperçu (par exemple 9:16 alors que l'aperçu est en 16:9), la vidéo finale ne ressemble plus à ce qu'on a monté. Je propose que l'aperçu ait le même sélecteur de format (dans sa barre, à côté de « Qualité »), et que l'export reprenne ce choix d'office. On garde la possibilité de le changer à l'export, l'image s'ajustant alors avec des bandes noires. D'accord ?

**Plan**
1. Import de vidéos : copie en flux dans le processus principal, avec progression, puis analyse FFprobe comme pour les clips de ReplayClip.
2. Pistes audio sans nom nommées « Piste N » ; une piste unique reste utilisée telle quelle.
3. `project.format` (largeur, hauteur) : par défaut celui du premier clip ; `upgradeProject` le donne aux anciens projets. `placement` ajuste un clip d'une autre forme dans l'image.
4. Sélecteur de format (selon Q21) et choix du format dans le panneau d'export : comme l'aperçu, 16:9 1080p, 9:16 1080×1920, carré 1080×1080.
5. Vérifier avec une vidéo de téléphone (verticale, 30 i/s) et une vidéo d'OBS à plusieurs pistes.

**Fichiers touchés** : `src/main/media.ts`, `components/Library.tsx`, `src/shared/project.ts`, `src/shared/geometry.ts`, `components/Preview.tsx`, `components/ExportPanel.tsx`, `src/main/export.ts`.

### Partage et mises à jour

**État** : prêt
**Idées** : envoyer l'app à des potes (Mac M1 ou plus récent, Windows 11), puis leur faire passer les nouvelles versions sans serveur.
**Taille** : gros · **Dépend de** : Clips venant d'ailleurs (sans lui, l'app ne sert à rien chez eux) ; Windows pour les potes sur PC.

**Décisions**
- Hébergement : les releases GitHub du dépôt public. Aucun serveur à faire tourner.
- Recherche d'une mise à jour au lancement, puis toutes les 4 heures tant que l'app reste ouverte.
- Le mécanisme de mise à jour est dans la 1.0 : une version envoyée sans lui obligerait à réinstaller à la main.
- Mises à jour automatiques : l'app télécharge la nouvelle version en arrière-plan pendant qu'on travaille, l'installe à la fermeture, et au lancement suivant c'est la nouvelle version. Un petit panneau « Quoi de neuf » glisse alors depuis le haut avec les notes de version.
- Numérotation : 1.0 au premier envoi, puis 1.1, 1.2… et 1.1.1 pour une simple correction.
- Pas de compte développeur Apple. Au premier lancement, macOS bloque l'app une fois : Réglages système › Confidentialité et sécurité › « Ouvrir quand même ». Sur Windows, SmartScreen fait pareil : « Informations complémentaires › Exécuter quand même ». Ensuite, les mises à jour passent sans rien demander.

**Plan**
1. `npm run release` : demande les notes de version, augmente le numéro, construit l'app (Mac et, plus tard, Windows), signe le zip Mac avec une clé privée qui reste sur ton Mac (hors du dépôt), crée la release GitHub avec `gh`.
2. Mac : le système standard d'Electron (Squirrel) refuse les apps signées localement, donc on écrit le nôtre (`src/main/updater.ts`). Au lancement, une requête à l'API GitHub ; si une version est plus récente, téléchargement du zip, vérification de sa signature avec la clé publique contenue dans l'app, puis remplacement de l'app dans `/Applications` après la fermeture et relance au lancement suivant.
3. Windows : `electron-updater` avec un installateur NSIS, qui fonctionne sans signature payante et fait déjà « télécharger en arrière-plan, installer à la fermeture ».
4. « Quoi de neuf » : au premier lancement d'une nouvelle version, les notes de la release s'affichent dans un panneau qui glisse depuis le haut.
5. Vérifier en vrai sur un deuxième compte du Mac : premier lancement, mise à jour 1.0 → 1.0.1, projets toujours lisibles (`upgradeProject`).
6. AGENTS.md : l'app n'est plus réservée au Mac de Thibaud ; documenter la publication d'une version.

**Fichiers touchés** : `scripts/release.mjs` (nouveau), `src/main/updater.ts` (nouveau), `package.json` (version, cibles), `AGENTS.md`.

### Windows

**État** : prêt
**Idées** : des potes sur Windows 11.
**Taille** : gros · **Dépend de** : rien, mais à faire avant d'envoyer l'app à un pote sur PC.

**Décisions**
- Windows 11 sur PC classique (x64) uniquement.
- Tests sur le PC Windows de Thibaud. L'installateur y arrive par une release GitHub (une version de test, « 1.1.0-beta.1 », que seul le PC installe), ce qui teste en même temps les mises à jour.
- Pas de barre de menu sur Windows : le logo de la barre du haut ouvre un menu qui reprend celui du Mac (Nouveau projet, Ouvrir, Exporter…).

**Plan**
1. Dossiers : `app.getPath('videos')` à la place de `~/Movies` (même résultat sur Mac, dossier Vidéos sur Windows) ; cache du modèle de transcription dans le dossier de cache de chaque système.
2. Export : au premier export, l'app essaie l'encodeur matériel de la carte graphique (NVIDIA `h264_nvenc`, Intel `h264_qsv`, AMD `h264_amf`) sur une image de test et garde le premier qui marche ; sinon `libx264`. Sur Mac, rien ne change (`h264_videotoolbox`).
3. Fenêtre : barre de titre intégrée aux couleurs Studio, avec les boutons de Windows à droite (`titleBarOverlay`) ; menu du logo.
4. Raccourcis affichés : ⌘ devient Ctrl, ⌥ devient Alt, ⇧ devient Maj.
5. Empaquetage : installateur NSIS x64 fabriqué depuis le Mac, avec les binaires Windows de FFmpeg, FFprobe et onnxruntime. `ffmpeg-static` ne télécharge que celui de la machine qui installe : le script de release va chercher celui de Windows.
6. Vérifier sur le PC : installation, bibliothèque, lecture, montage, transcription, export, mise à jour.

**Fichiers touchés** : `src/main/projects.ts`, `src/main/media.ts`, `src/main/export.ts`, `src/main/transcriber.ts`, `src/main/index.ts`, `package.json`, un composant pour le menu du logo, l'affichage des raccourcis.

### Qualité de l'aperçu

**État** : prêt, mais pas urgent (rien ne rame aujourd'hui)
**Idées** : régler l'aperçu en 720p 30 i/s ou en pleine qualité, par précaution.
**Taille** : moyen · **Dépend de** : rien. Plus utile une fois l'app sur des machines moins puissantes.

**Décisions**
- Réglage de l'app (il dépend de la machine), pas du projet, dans la barre de lecture : « Qualité » Pleine ou 720p.
- En 720p, l'aperçu lit des copies légères (720p, 30 i/s) calculées en arrière-plan par FFmpeg et gardées en cache, comme les vignettes. Tant qu'une copie n'est pas prête, l'original est lu. L'export part toujours des originaux.

**Plan**
1. `src/main/media.ts` : fabrication des copies (encodeur matériel, file d'attente basse priorité), dans le cache `Media`.
2. Le moteur de lecture choisit la copie ou l'original selon le réglage ; changer de réglage ne coupe pas la lecture.
3. Réglage enregistré dans `settings.json`.

<!--
Modèle d'un chantier :

### Nom court

**État** : à clarifier | prêt | passé au lot N
**Idées** : les lignes du vrac regroupées ici.
**Taille** : petit | moyen | gros · **Dépend de** : autre chantier, ou rien.

**Questions**
- Q1. … → réponse

**Décisions**
- …

**Plan**
1. …

**Fichiers touchés** : `src/…`
-->

## Écartées

<!-- Idée — pourquoi on ne la fait pas (ou pas maintenant). -->
