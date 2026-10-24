# TODO

Les quatre premiers lots sont faits. On code lot par lot. Un lot est fini quand il compile, que l'app se lance, que tout est vérifié dans l'app et poussé sur GitHub.

## Décisions d'UI et d'UX

- **Ajouter un clip** : on le glisse depuis la bibliothèque jusqu'à l'endroit voulu de la timeline (pas de double-clic).
- **Timeline libre et aimantée** : les morceaux se placent n'importe où, les trous sont permis. Ils s'aimantent aux bords des autres morceaux, au curseur et au début de la timeline.
- **Pistes** : une ligne vidéo, puis une ligne par source audio, rangées par nom (`Micro`, `Minecraft`, `Discord`, `Autres sons`). Les morceaux de tous les clips qui ont la même source vont sur la même ligne. On peut ajouter des lignes pour les fonds sonores.
- **Couper (S)** : coupe au curseur. Si des morceaux sont sélectionnés, S coupe ceux-là et ceux qui leur sont liés. Sans sélection, S coupe toutes les pistes sous le curseur.
- **Supprimer** : ⌫ supprime la sélection et laisse un trou. ⇧⌫ supprime et referme le trou en décalant la suite.
- **Lier et délier** : la vidéo et les pistes audio d'un clip sont liées dès qu'on le place. ⌘L ou clic droit (« Délier », « Lier ») agit sur la sélection. Les morceaux liés bougent, se coupent et se suppriment ensemble. Une icône de chaîne les signale.
- **Volume** : un clic sur le nom d'une piste ouvre ses réglages dans l'inspecteur, qui glisse depuis la droite. Le volume va de 0 à 200 % et vaut pour toute la piste.
- **Normalisation** : un bouton ponctuel. Il mesure le niveau sonore des pistes incluses et règle leurs volumes pour qu'elles sonnent pareil. Ensuite on peut retoucher à la main. Chaque piste a un interrupteur « Normaliser » pour l'exclure.
- **Fond sonore** : le bouton + sous les pistes crée une piste vide (« Bande son »). On y glisse un son depuis la bibliothèque ou depuis le Finder. Un son glissé ailleurs crée sa propre piste.
- **Bibliothèque « Fichiers »** : les clips vidéo de `~/Movies/Clips` et les sons importés. On importe un son en le glissant sur la bibliothèque ou avec le + de son en-tête ; il est copié dans `~/Movies/Easy Edit/Sons`, pour que le projet ne dépende pas d'un fichier qui traîne ailleurs.
- **Projets** : chaque montage est un fichier projet (⌘N, ⌘O) enregistré automatiquement en continu. Le dernier projet se rouvre au lancement.
- **Export** : en .mp4, dans un panneau qui glisse depuis le haut. C'est le dernier lot.

## Lot 1 : projet et timeline de base ✓

- [x] Modèle de projet : pistes (vidéo, audio), morceaux (fichier source, flux, plage dans la source, position sur la timeline, groupe de liaison), volume et normalisation par piste.
- [x] Fichier projet `.easyedit` (JSON) : ⌘N, ⌘O, enregistrement automatique, réouverture du dernier projet au lancement.
- [x] L'aperçu lit la timeline : deux lecteurs vidéo qui se relaient, son par la Web Audio API, une piste audio extraite par source.
- [x] Timeline : règle avec minutage (clic et glissé pour se déplacer), morceaux avec vignettes, curseur de lecture qui suit la lecture.
- [x] Zoom (pincement, ⌘= et ⌘−, ⇧Z pour tout voir, curseur de zoom) et défilement horizontal.
- [x] Glisser un clip de la bibliothèque sur la timeline, avec aimantation (bords des morceaux, curseur, début) : ses morceaux liés se posent sur les bonnes pistes.
- [x] Lecture : Espace, J/K/L, ← et → image par image (⇧ : 10 images), Début et Fin.

## Lot 2 : montage ✓

- [x] Sélection : clic (le morceau et ceux qui lui sont liés), ⇧clic pour ajouter ou retirer, clic dans le vide ou Échap pour tout désélectionner, ⌘A pour tout sélectionner.
- [x] Déplacer les morceaux à la souris avec aimantation (bords des autres morceaux, curseur, début). Les morceaux liés suivent ; ce qu'ils recouvrent à l'arrivée est raccourci.
- [x] Couper avec S, selon les règles ci-dessus. Les deux moitiés d'un groupe lié restent liées chacune de son côté.
- [x] ⌫ (laisse un trou) et ⇧⌫ (referme le trou sur toutes les pistes, si le trou est libre partout).
- [x] Lier et délier : ⌘L, clic droit, icône de chaîne sur la vidéo, chaîne barrée orange sur un son délié.
- [x] Annuler et rétablir (⌘Z, ⇧⌘Z) pour toutes les actions de montage.
- [x] Animations : les morceaux glissent en ressort vers leur nouvelle place (suppression, annulation), un morceau coupé apparaît en glissant légèrement, le déplacement à la souris suit sans retard.
- [x] Formes d'onde dans les morceaux audio (calculées à partir du son déjà décodé pour la lecture, gardées en mémoire, sans recalcul au zoom).

## Lot 3 : son ✓

- [x] Clic sur le nom d'une piste audio : ses réglages dans l'inspecteur, qui glisse depuis la droite (volume de 0 à 200 % avec repère à 100 % et double-clic pour y revenir, coupure du son, interrupteur « Normaliser »). Clic dans le vide, Échap ou × pour le refermer.
- [x] Volume jusqu'à 200 % à l'écoute (un gain Web Audio par piste) ; la forme d'onde grandit ou rapetisse avec le volume ; une piste coupée est grisée et marquée dans son en-tête.
- [x] Fond sonore : glisser un fichier audio (mp3, m4a, aac, wav, aiff, flac, ogg) depuis le Finder sur la timeline, ou bouton + sous les pistes. Une nouvelle piste au nom du fichier ; déposé sur une piste de fond sonore existante, il s'y ajoute. Plusieurs fichiers s'enchaînent.
- [x] Renommer (dans l'inspecteur) et supprimer une piste de fond sonore.
- [x] Bouton « Normaliser » : niveau sonore perçu de chaque piste incluse (blocs de 400 ms, portes à -70 dB et -10 dB, sur les parties utilisées), puis volumes réglés sur la médiane, plafonnés à 200 %. Les pistes silencieuses ne bougent pas. Une seule étape d'annulation.
- [x] Les crans successifs d'un même réglage de volume ne font qu'une étape d'annulation.

## Lot 4 : export ✓

- [x] Bouton « Exporter » dans la barre du haut (et ⌘E) : un panneau glisse depuis le haut, avec le nom du fichier, le dossier (par défaut `~/Movies/Easy Edit/Exports`) et la qualité (taille d'origine ou 1080p).
- [x] Export en arrière-plan par FFmpeg : morceaux vidéo et trous noirs mis bout à bout à 60 i/s, chaque son placé à son instant avec le volume de sa piste (jusqu'à 200 %), pistes coupées exclues, fonds sonores compris. Encodage H.264 matériel (VideoToolbox), AAC 192 kb/s. Environ 3 fois plus vite que le temps réel.
- [x] Barre de progression, annulation (aucun fichier à moitié écrit ne reste), message d'erreur lisible.
- [x] À la fin : afficher le fichier dans le Finder. Un nom déjà pris devient « Nom 2.mp4 ».

## Lot 5 : calques et images ✓

- [x] Boutons « + Vidéo » et « + Audio » sous les pistes. Une piste vidéo s'ajoute tout en haut ; la piste la plus haute passe par-dessus les autres, dans l'aperçu comme à l'export. Renommer ou supprimer une piste vidéo dans l'inspecteur (il en reste toujours une).
- [x] Images (png, jpg, webp, bmp, tiff) : importées dans la bibliothèque (glisser ou +, copiées dans `~/Movies/Easy Edit/Images`), posées sur une piste vidéo pour 5 s, durée réglée en tirant leurs bords. La transparence d'un png laisse voir les pistes du dessous.
- [x] Un clip ou une image va sur la piste vidéo visée au dépôt (sinon la plus basse) ; un son sur la bande son visée.

## Lot 6 : cadrage ✓

- [x] Bibliothèque classée : Vidéos, puis Images, puis Sons (une catégorie vide n'apparaît pas).
- [x] Clic droit sur un morceau vidéo ou une image, dans la timeline ou sur l'aperçu : « Redimensionner », « Rogner », « Réinitialiser le cadrage ». Sur l'aperçu, c'est la piste visible sous le pointeur qui est visée (la plus haute d'abord ; une partie rognée laisse passer le clic vers la piste du dessous).
- [x] Redimensionner : déplacer la boîte, agrandir ou réduire par les coins autour du centre. Rogner : tirer les bords ou les coins ; glisser l'intérieur déplace la fenêtre de rognage. La barre « Redimensionner · Rogner · Réinitialiser · Terminé » remplace les commandes de lecture le temps du cadrage ; Échap, Terminé ou un clic à côté pour finir.
- [x] Clic sur l'aperçu : sélectionne ce qui est visible sous le pointeur (contour orange) ; glisser le déplace directement.
- [x] Chaque geste est une étape d'annulation. L'export applique la même taille, la même position et le même rognage que l'aperçu.

## Lot 7 : sous-titres automatiques ✓

- [x] Transcription sur le Mac, sans internet après le premier téléchargement du modèle (environ 400 Mo, en cache dans `~/Library/Caches/desert-ant-models`), par Voz (Desert Ant Labs, Parakeet TDT 0.6B v3) avec onnxruntime-node, dans un processus à part (`src/main/transcriber.ts`). Environ 10 s pour un clip de 30 s.
- [x] Bouton « Transcrire » à côté de « Normaliser » : un clic ouvre « Quelle piste transcrire ? » (le micro coché d'office) ; on peut aussi glisser le bouton sur une piste audio.
- [x] Une piste « Sous-titres · <piste> » tout en haut de la timeline : un morceau par phrase courte (coupée à la ponctuation, aux pauses, ou au-delà de 7 mots), chaque mot avec ses temps.
- [x] Double-clic sur un sous-titre pour corriger son texte ; on le coupe, déplace, rogne et supprime comme les autres morceaux.
- [x] Quatre styles dans la direction Studio (Classique, Bandeau, Impact, Mot à mot) et une couleur d'accent pour le mot prononcé (ou sans accent), choisis par piste dans l'inspecteur.
- [x] Les sous-titres sont incrustés à l'export, dans le même style (libass, police Inter fournie avec l'app).
- [x] La piste de sous-titres est une piste vidéo : elle se superpose aux autres selon sa place dans la timeline, et chaque sous-titre se déplace (glisser sur l'aperçu) et se redimensionne (clic droit, « Redimensionner ») comme une image. Il ne se rogne pas.
- [x] « Appliquer à tous » (barre de cadrage, ou clic droit « Appliquer à toute la piste ») : tous les sous-titres de la même piste prennent la place et la taille de celui-ci, en une étape d'annulation.
- [x] Clic droit sur le nom d'une piste : « Supprimer la piste » (annulable).

## Plus tard

- Réordonner les pistes en les glissant.
- Fondus audio et vidéo.
- Clips de tailles différentes dans un même montage (pour l'instant, l'aperçu prend le format du premier clip).
- Normalisation plus fidèle (pondération K des LUFS) et calcul dans un worker si les projets deviennent longs.
