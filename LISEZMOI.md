# Mes Locations — installation

## 1. Google Sheets (back-end)
1. Ouvre le tableur LOYERS > Extensions > Apps Script.
2. Remplace tout le code par `apps-script/Code.gs`, puis enregistre.
3. Sélectionne la fonction **installer**, puis clique sur **Exécuter** et accepte les autorisations.
   - Elle crée les onglets **Paramètres** et **Paiements**.
   - Elle remplace les anciens déclencheurs (`verifierEnvoiEmail…`) par un déclencheur horaire, `tacheAutomatique`.
   - Elle affiche le **code secret** de l'application (ligne `token` de l'onglet Paramètres).
4. Va dans Déployer > Nouveau déploiement > type **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde** (l'accès reste protégé par le code secret)
   - Copie l'URL qui se termine par `/exec`.

> Après chaque modification du script : Déployer > Gérer les déploiements > ✏️ > Version : **Nouvelle version**. Sinon, l'URL continue de servir l'ancienne version.

## 2. GitHub Pages (application)
1. Crée un dépôt `mes-locations`, puis envoie à la racine : `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest` et le dossier `icons/`.
   - Le dossier `apps-script/` n'est pas nécessaire sur GitHub.
2. Va dans Settings > Pages > Branch `main` / root.
3. Sur ton téléphone, ouvre `https://chrissorbadere.github.io/mes-locations/`, puis Menu > **Ajouter à l'écran d'accueil**.
4. Saisis l'URL `/exec` et le code secret.

## Fonctionnement
- **Chaque mois, à la date et à l'heure choisies** : la quittance part **seulement si tu as validé le paiement**. Sinon, tu reçois une alerte et la quittance attend ta validation.
- **Valider un paiement** : le jour de réception figure sur la quittance (« Date du paiement »). Le mois de la quittance est celui du paiement validé, même si tu l'envoies plus tard.
- **Assurance** : la demande part une fois par an, à la date choisie. Une relance part tous les X jours tant que l'attestation n'est pas marquée « reçue ».
- **Emails des locataires** : ils sont modifiés directement dans l'onglet Principale (K16 et K31).
- **Envois** : ils passent tous par ton Gmail, avec une copie cachée à l'adresse de ton choix.
- **Boutons et cases du tableur** (K3, M3, archmaison…) : ils fonctionnent toujours. Les utiliser vaut validation du paiement du mois.

## Relevés d'agence automatiques (v1.5)

- Chaque heure, le script cherche dans Gmail les emails de l'expéditeur réglé (par défaut `laforet.com`) avec un PDF « Compte rendu de gestion ».
- Le PDF est converti en texte par Google Drive, lu, vérifié (loyers + provisions − frais = solde créditeur), enregistré et archivé dans « Relevés agence ».
- Si un relevé du même mois existe avec le même net, seul le PDF est joint ; avec un autre net, il est remplacé par les chiffres du PDF.
- Si la lecture échoue, un email t'invite à saisir le relevé à la main.
- Dans l'application, « Ajouter un relevé » › « Lire le PDF du relevé » fait la même lecture à partir d'un PDF choisi.
