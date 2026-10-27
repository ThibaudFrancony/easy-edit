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

## Lot 8 : plein écran de l'aperçu ✓

- [x] F (ou le bouton de la barre de lecture) : l'aperçu grandit en ressort jusqu'à remplir l'écran, sur fond noir. Les commandes de lecture apparaissent quand la souris bouge et disparaissent après 2 s. Échap, F ou double-clic pour sortir. Les raccourcis de lecture marchent toujours.
- [x] Deuxième écran (⇧F, ou le bouton qui n'apparaît qu'avec un écran branché) : l'image seule en plein écran sur l'autre écran, comme un moniteur de contrôle, pendant que le montage continue sur l'écran principal. Une seule horloge et le son dans la fenêtre principale.
- [x] Débrancher l'écran ferme le moniteur ; fermer la fenêtre principale le ferme aussi.

## Lot 9 : Windows et import de vidéos

- [x] Dossiers par système : le dossier Vidéos de l'utilisateur (`~/Movies` sur Mac) pour les projets, exports, sons, images et vidéos importées.
- [x] Export : encodeur matériel de la carte graphique sur Windows (NVIDIA, Intel ou AMD, essayés dans cet ordre), `libx264` en secours ; noms de fichier sans les caractères interdits par Windows ; sous-titres sans chemin dans le graphe FFmpeg.
- [x] Fenêtre Windows : barre de titre aux couleurs Studio avec les boutons de Windows à droite ; le logo ouvre le menu de l'app.
- [x] Raccourcis : Ctrl à la place de ⌘ (y compris dans les libellés affichés), « Afficher dans l'Explorateur ».
- [x] Import de vidéos (+ ou glisser) : copiées dans `Easy Edit/Vidéos` ; un .mkv (OBS) est converti en .mp4 sans réencodage. Plusieurs pistes audio sans nom deviennent « Piste 1 », « Piste 2 »…
- [x] `npm run app:win` : installateur Windows x64 (NSIS, sans droits administrateur) construit depuis le Mac, avec FFmpeg, FFprobe et onnxruntime pour Windows.
- [ ] Testé sur le PC : installation, bibliothèque, lecture, montage, transcription, export.
- [x] Menu « Plugins » dans la barre du haut (et dans le menu de l'app) ; premier plugin « Transcript », qui ouvre « Quelle piste transcrire ? » comme le bouton « Transcrire ».
- [ ] Menu « Plugins » vérifié dans l'app.

## Lot 10 : plugin Motion blur

Le flou de mouvement à la manière de ReelSmart Motion Blur : RIFE calcule des images intermédiaires entre deux vraies images, et chaque image floutée est la moyenne de celles qui tombent pendant que l'obturateur est ouvert. Ce qui ne bouge pas (le HUD) reste net.

- [x] Réglé sur une piste vidéo entière, dans l'inspecteur : interrupteur « Motion blur » (couper garde les réglages), Intensité (0 à 100 %, 50 % par défaut, soit un obturateur à 180° ; double-clic pour y revenir), Qualité (4, 8 ou 16 images intermédiaires), Pondération (Égale ou Douce), Cadence (60 ou 30 i/s).
- [x] Plugins › Motion blur (barre du haut et menu de l'app) : ouvre ces réglages pour la piste visée et allume le flou.
- [x] À l'export seulement : l'aperçu montre la vidéo sans flou. Chaque morceau est flouté avant l'encodage (étape « Motion blur » dans le panneau d'export, annulable), puis gardé en cache.
- [x] RIFE 4.22 lite (ONNX, fourni avec l'app) dans un processus à part, sur la puce graphique : CoreML ou WebGPU sur Mac, DirectML sur Windows (le plus rapide des deux, mesuré au premier calcul), le processeur en secours.
- [ ] Vérifié sur le Mac : vitesse avec CoreML sur un clip de ReplayClip en 1728×1080, rendu sur une vraie partie.
- [ ] Vérifié sur le PC : DirectML.

## Lot 11 : rendu sur le PC Linux

Le montage se fait sur le Mac ; l'export peut partir sur le PC Linux de la maison (Core i5-9400F, GeForce GTX 1650), toujours allumé, pour épargner le Mac. Réseau de la maison seulement.

Mesures du 27/10/2026 (motion blur, RIFE par image intermédiaire) : 2 s sur le processeur, 195 ms sur la carte en 1728×1080 (88 ms en 1152×720, 52 ms en 864×540). Flou complet avec les réglages par défaut : environ 56 s par seconde de vidéo en 1728×1080.

- [x] L'export ne dépend plus d'Electron (`runtime.ts`, `media-tools.ts`, `render.ts`) : l'app et le service font exactement le même rendu.
- [x] Service `src/render-server/` (Node seul) : HTTP sur le port 7171, adresses privées seulement, annoncé par Bonjour (`_easyedit-render._tcp`), un rendu à la fois, rendus gardés sur disque. Motion blur sur la carte NVIDIA (CUDA 13.2 et cuDNN 9 dans `~/.local/share/easy-edit-render/cuda`).
- [x] Code d'appairage à 6 chiffres (10 essais faux : une minute de blocage), demandé une fois dans le panneau d'export.
- [x] Clips envoyés une seule fois (nommés par leur empreinte SHA-256, vérifiée à l'arrivée) ; le PC extrait lui-même les pistes audio.
- [x] Panneau d'export : « Ce Mac · PC Linux » quand le PC répond (choix retenu), étapes Envoi, Motion blur, Encodage, Réception ; annulation jusque sur le PC.
- [x] Une vidéo finie pendant que l'app était fermée est récupérée au lancement suivant, rangée dans son dossier, et le panneau d'export l'annonce.
- [x] Essayé de bout en bout sur le PC (client Node) : envoi, motion blur sur la carte, sous-titres, son, réception ; deuxième rendu sans envoi ni recalcul ; annulation en plein calcul.
- [x] Installé sur le PC : `npm run render-server` (service systemd `easy-edit-render`, actif).
- [x] Démarrage avec le PC (`sudo loginctl enable-linger thib`) et ports 7171/tcp et 5353/udp ouverts dans ufw pour 192.168.1.0/24.
- [x] Vérifié depuis le Mac : découverte (en dev et dans l'app installée, une fois l'exécutable doté de son propre UUID).
- [x] Repli sans Bonjour : dernière adresse connue, puis `whorespace.local` ; le service s'annonce désormais en `<nom>.local` (il annonçait « whorespace. », que le Mac ne résout pas).
- [ ] Service du PC mis à jour (`git pull` puis `npm run render-server`) pour l'annonce en .local et le flou plus rapide.
- [x] Vérifié depuis le Mac : appairage, export complet (30,5 s de vidéo 1920×1080 avec motion blur : 32 min, dont 98,5 % de flou, 18 s d'encodage, 2 s de réception).
- [ ] Vérifié depuis le Mac : reprise après fermeture de l'app.

Vitesse du flou sur le PC (27/10/2026, extrait de 2 s en 1920×1080, réglages par défaut : 4 calculs RIFE par image) :
- [x] Calculs RIFE envoyés d'avance à la carte (deux en vol) pendant que le processeur prépare et mélange ; arrondi final par `Uint8ClampedArray` (18 ms au lieu de 61) : 126 → 116 s.
- [x] Modèle pour la carte NVIDIA `rife-v4.22-lite-cuda.onnx` (`scripts/rife-cuda-model.py`) : images en octets RGB à l'entrée et à la sortie, résultat identique à l'original, quatre fois moins de données copiées : 116 → 102,5 s (−19 % en tout). La carte calcule désormais sans arrêt : la suite ne peut venir que de moins de calcul.
- Essayé et écarté : demi-précision (2,6 fois plus lente sur la GTX 1650, sans cœurs Tensor, et moins juste), RIFE à demi-résolution (−25 % seulement, image nettement différente), TensorRT (3,8 à 6 Go de bibliothèques, version 11 alors qu'ONNX Runtime attend la 10).
- Sur le Mac, le modèle en octets n'apporte rien (WebGPU à égalité, CoreML plus lent) : le Mac garde le modèle d'origine. Le Mac et le PC ne donnent pas exactement la même image floutée (PSNR 35 dB : CoreML/WebGPU et CUDA ne calculent pas pareil), c'était déjà le cas avant.
- Le réglage Qualité 4 au lieu de 8 divise le temps par deux (2 calculs par image au lieu de 4) : à comparer à l'œil.

## Plus tard

Les idées pas encore planifiées sont dans [IDEES.md](IDEES.md).
