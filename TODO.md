# TODO

On code lot par lot. Un lot est fini quand il compile, que l'app se lance, que tout est vérifié dans l'app et poussé sur GitHub.

## Décisions d'UI et d'UX

- **Ajouter un clip** : on le glisse depuis la bibliothèque jusqu'à l'endroit voulu de la timeline (pas de double-clic).
- **Timeline libre et aimantée** : les morceaux se placent n'importe où, les trous sont permis. Ils s'aimantent aux bords des autres morceaux, au curseur et au début de la timeline.
- **Pistes** : une ligne vidéo, puis une ligne par source audio, rangées par nom (`Micro`, `Minecraft`, `Discord`, `Autres sons`). Les morceaux de tous les clips qui ont la même source vont sur la même ligne. On peut ajouter des lignes pour les fonds sonores.
- **Couper (S)** : coupe au curseur. Si des morceaux sont sélectionnés, S coupe ceux-là et ceux qui leur sont liés. Sans sélection, S coupe toutes les pistes sous le curseur.
- **Supprimer** : ⌫ supprime la sélection et laisse un trou. ⇧⌫ supprime et referme le trou en décalant la suite.
- **Lier et délier** : la vidéo et les pistes audio d'un clip sont liées dès qu'on le place. ⌘L ou clic droit (« Délier », « Lier ») agit sur la sélection. Les morceaux liés bougent, se coupent et se suppriment ensemble. Une icône de chaîne les signale.
- **Volume** : un clic sur le nom d'une piste ouvre ses réglages dans l'inspecteur, qui glisse depuis la droite. Le volume va de 0 à 200 % et vaut pour toute la piste.
- **Normalisation** : un bouton ponctuel. Il mesure le niveau sonore des pistes incluses et règle leurs volumes pour qu'elles sonnent pareil. Ensuite on peut retoucher à la main. Chaque piste a un interrupteur « Normaliser » pour l'exclure.
- **Fond sonore** : on glisse un fichier audio (mp3, m4a, wav, aiff) depuis le Finder sur la timeline, ou on clique sur le bouton + sous les pistes. Ça crée une nouvelle piste.
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

## Lot 4 : export

- [ ] Panneau d'export qui glisse depuis le haut : nom, dossier, qualité (taille d'origine ou 1080p, H.264).
- [ ] Export en arrière-plan avec le son mixé comme dans l'aperçu (volumes jusqu'à 200 %, coupures, fonds sonores), avec les filtres audio de FFmpeg. Barre de progression, annulation.
- [ ] À la fin : afficher le fichier dans le Finder.

## Plus tard

- Réordonner les pistes en les glissant.
- Fondus audio et vidéo.
- Clips de tailles différentes dans un même montage (pour l'instant, l'aperçu prend le format du premier clip).
- Icône de l'app.
- Normalisation plus fidèle (pondération K des LUFS) et calcul dans un worker si les projets deviennent longs.
