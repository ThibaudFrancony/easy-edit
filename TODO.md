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

## Lot 2 : montage

- [ ] Sélection : clic, ⇧clic, clic dans le vide pour tout désélectionner.
- [ ] Déplacer les morceaux à la souris avec aimantation. Les morceaux liés suivent.
- [ ] Couper avec S, selon les règles ci-dessus.
- [ ] ⌫ (laisse un trou) et ⇧⌫ (referme le trou).
- [ ] Lier et délier : ⌘L, clic droit, icône de chaîne.
- [ ] Annuler et rétablir (⌘Z, ⇧⌘Z) pour toutes les actions de montage.
- [ ] Animations : un morceau coupé s'écarte légèrement, une suppression se referme en douceur, un déplacement s'aimante avec un ressort.

## Lot 3 : son

- [ ] Clic sur le nom d'une piste : ses réglages dans l'inspecteur (volume de 0 à 200 %, coupure, interrupteur « Normaliser »).
- [ ] Le même mixage à l'export qu'à l'aperçu (volumes jusqu'à 200 %, coupures), avec les filtres audio de FFmpeg.
- [ ] Formes d'onde dans les morceaux audio, calculées en arrière-plan et gardées en cache.
- [ ] Fond sonore : glisser un fichier audio depuis le Finder, et bouton + sous les pistes. Renommer et supprimer une piste ajoutée.
- [ ] Bouton « Normaliser » : mesure du niveau sonore perçu de chaque piste incluse (en arrière-plan, en cache), puis réglage des volumes sur un niveau commun, plafonné à 200 %.

## Lot 4 : export

- [ ] Panneau d'export qui glisse depuis le haut : nom, dossier, qualité (taille d'origine ou 1080p, H.264).
- [ ] Export en arrière-plan avec le son mixé comme dans l'aperçu (volumes, coupures, gain au-delà de 100 %). Barre de progression, annulation.
- [ ] À la fin : afficher le fichier dans le Finder.

## Plus tard

- Réordonner les pistes en les glissant.
- Fondus audio et vidéo.
- Clips de tailles différentes dans un même montage (pour l'instant, l'aperçu prend le format du premier clip).
- Icône de l'app.
