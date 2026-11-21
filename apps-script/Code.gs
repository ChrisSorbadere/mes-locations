/******************************************************************
 *  MES LOCATIONS — Back-end Google Apps Script
 *  Quittances, demandes d'assurance, suivi des paiements, API pour la PWA
 *
 *  INSTALLATION (une seule fois) :
 *   1. Coller ce fichier à la place de l'ancien code, enregistrer.
 *   2. Exécuter la fonction  installer  (autoriser l'accès demandé).
 *      -> crée les onglets « Paramètres » et « Paiements »,
 *         remplace les anciens déclencheurs par un déclencheur horaire,
 *         affiche le CODE SECRET à saisir dans l'application.
 *   3. Déployer > Nouveau déploiement > Application Web
 *      Exécuter en tant que : Moi  |  Accès : Tout le monde
 *      -> copier l'URL /exec dans l'application.
 ******************************************************************/

// ================= CONFIGURATION FIXE =================
const SS_ID = '1viybDvA_H19PXDGqmMS0y5CGHof3VjJ9ewQ5mrGuFKA';
const DOSSIER_QUITTANCES = '1sJg9v5KYaiOlDUIzTIGLt6GafDhLILK0';
const DOSSIER_ASSURANCES = '1aJpRx8b6Fd1Fci2Pnl3J2txrh3z0LAML';
const FEUILLE_ENVOI = 'Envoi email';
const FEUILLE_PARAMS = 'Paramètres';
const FEUILLE_PAIEMENTS = 'Paiements';

const LOGEMENTS = {
  maison: {
    libelle: 'Maison',
    adresse: '5 route du chemin Large',
    cellules: { civilite: 'K6', prenom: 'L6', nom: 'M6', email: 'K16', loyer: 'K8', charges: 'K12' },
    feuilleQuittance: 'Quittance Maison',
    feuilleAssurance: 'Assurance Maison',
    anciennesCases: { quittance: 'B16', assurance: 'F16' }
  },
  trianon: {
    libelle: 'Trianon',
    adresse: '5 Bis route du chemin Large',
    cellules: { civilite: 'K21', prenom: 'L21', nom: 'M21', email: 'K31', loyer: 'K23', charges: 'K27' },
    feuilleQuittance: 'Quittance Trianon',
    feuilleAssurance: 'Assurance Trianon',
    anciennesCases: { quittance: 'B18', assurance: 'F18' }
  }
};

// Cellules de la feuille quittance pilotées par le script lors de l'export
const CELLULES_MOIS_QUITTANCE = ['E4', 'B23', 'D26'];
const CELLULE_JOUR_PAIEMENT = 'C26';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
              'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ================= SCHÉMA DES PARAMÈTRES =================
// [clé, type, valeur par défaut, description, modifiable depuis l'app]
function schema_() {
  const s = [
    ['copie_cachee', 'text', 'chris.soulas@gmail.com', 'Adresse en copie cachée de chaque envoi', true],
    ['signature', 'text', 'Christophe SOULAS', 'Signature des emails', true],
    ['email_alertes', 'text', 'chris.soulas@gmail.com', 'Adresse qui reçoit les alertes (paiement non validé, erreur)', true],
    ['alertes_actives', 'bool', 'TRUE', 'Recevoir les emails de notification (interrupteur général)', true],
    ['notif_loyer', 'bool', 'TRUE', 'Email quand un loyer est à valider (jour de l\'échéance)', true],
    ['notif_loyer_rappel_jours', 'num', '3', 'Rappel si le loyer n\'est toujours pas validé X jours après l\'échéance (0 = jamais)', true],
    ['notif_attestation', 'bool', 'TRUE', 'Email pour confirmer la réception de l\'attestation d\'assurance', true],
    ['notif_attestation_jours', 'num', '7', 'Délai après la demande (puis entre deux emails) pour confirmer l\'attestation', true],
    ['notif_quittance_bloquee', 'bool', 'TRUE', 'Email si un paiement est validé mais la quittance n\'est pas partie', true],
    ['notif_actions', 'bool', 'TRUE', 'Email « Actions à faire » dès qu\'une nouvelle action apparaît (1 par jour au plus)', true],
    ['recap_mensuel', 'bool', 'TRUE', 'Récapitulatif mensuel le 1er du mois', true],
    ['app_url', 'text', 'https://chrissorbadere.github.io/Loyers/index.html', 'Adresse de l\'application (lien des emails)', true],
    ['quittance_jour', 'num', '10', 'Jour d\'envoi des quittances (1-31)', true],
    ['quittance_heure', 'num', '12', 'Heure d\'envoi (0-23)', true],
    ['envoi_a_la_validation', 'bool', 'TRUE', 'Si la date est passée, envoyer la quittance dès la validation du paiement', true],
    ['assurance_jour', 'num', '4', 'Jour de la demande annuelle d\'attestation', true],
    ['assurance_mois', 'num', '1', 'Mois de la demande annuelle (1-12)', true],
    ['relance_active', 'bool', 'TRUE', 'Relancer si l\'attestation n\'est pas reçue', true],
    ['relance_jours', 'num', '15', 'Délai entre deux relances (jours)', true],
    ['rappel_impaye_jours', 'num', '5', 'Rappel au locataire X jours après l\'échéance si le loyer n\'est pas validé', true],
    ['objet_rappel_loyer', 'text', 'Rappel : loyer de {mois} {annee} - {adresse}', 'Objet email rappel de loyer', true],
    ['corps_rappel_loyer', 'text',
      'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu le loyer de {mois} {annee} ({montant}) pour la location du :\n\n{adresse}\n{commune}\n\nSi le paiement est déjà parti, merci de ne pas tenir compte de ce message.\nBien cordialement.\n{signature}',
      'Texte email rappel de loyer', true],
    ['objet_quittance', 'text', 'Quittance de loyer - {mois} {annee} - {adresse}', 'Objet email quittance', true],
    ['corps_quittance', 'text',
      'Bonjour {civilite} {nom},\n\nVoici la quittance de loyer du mois de {mois} {annee} pour votre location du :\n\n{adresse}\n{commune}\n\nVous souhaitant bonne réception.\nBien cordialement.\n{signature}',
      'Texte email quittance', true],
    ['objet_assurance', 'text', 'Attestation d\'assurance {annee} - {adresse}', 'Objet email assurance', true],
    ['corps_assurance', 'text',
      'Bonjour {civilite} {nom},\n\nConformément à la loi (article 7 de la loi n°89-462 du 6 juillet 1989 relative aux rapports locatifs), je vous prie de bien vouloir me renvoyer l\'attestation d\'assurance pour la location du :\n\n{adresse}\n{commune}\n\nVous souhaitant une excellente journée.\nBien cordialement.\n{signature}',
      'Texte email assurance', true],
    ['objet_relance', 'text', 'Rappel : attestation d\'assurance {annee} - {adresse}', 'Objet email relance', true],
    ['corps_relance', 'text',
      'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu votre attestation d\'assurance {annee} pour la location du :\n\n{adresse}\n{commune}\n\nJe vous remercie de bien vouloir me la transmettre dès que possible.\nBien cordialement.\n{signature}',
      'Texte email relance', true]
  ];
  Object.keys(LOGEMENTS).forEach(function (id) {
    const L = LOGEMENTS[id];
    s.push([id + '.quittance_active', 'bool', 'TRUE', L.libelle + ' : envoi des quittances', true]);
    s.push([id + '.assurance_active', 'bool', 'TRUE', L.libelle + ' : demande d\'assurance', true]);
    s.push([id + '.email2', 'text', '', L.libelle + ' : email secondaire du locataire (en copie)', true]);
    s.push([id + '.adresse', 'text', L.adresse, L.libelle + ' : adresse du bien', true]);
    s.push([id + '.commune', 'text', 'à St Sulpice et Cameyrac.', L.libelle + ' : commune', true]);
    s.push([id + '.assurance_envoyee', 'text', '', L.libelle + ' : date de la dernière demande (auto)', false]);
    s.push([id + '.derniere_relance', 'text', '', L.libelle + ' : date de la dernière relance (auto)', false]);
    s.push([id + '.assurance_recue', 'text', '', L.libelle + ' : année de la dernière attestation reçue', false]);
    s.push([id + '.alerte_periode', 'text', '', L.libelle + ' : dernière alerte paiement (auto)', false]);
    s.push([id + '.alerte_rappel_periode', 'text', '', L.libelle + ' : dernier rappel « loyer à valider » (auto)', false]);
    s.push([id + '.alerte_bloquee_periode', 'text', '', L.libelle + ' : dernière alerte quittance bloquée (auto)', false]);
    s.push([id + '.alerte_attestation', 'text', '', L.libelle + ' : dernier email attestation à confirmer (auto)', false]);
    s.push([id + '.rappel_impaye', 'bool', 'FALSE', L.libelle + ' : rappel automatique si loyer impayé', true]);
    s.push([id + '.gestion', 'text', 'directe', L.libelle + ' : gestion « directe » ou « agence » (l\'agence encaisse et envoie les quittances)', true]);
    s.push([id + '.agence_nom', 'text', '', L.libelle + ' : nom de l\'agence', true]);
    s.push([id + '.rappel_periode', 'text', '', L.libelle + ' : dernier rappel de loyer envoyé (auto)', false]);
  });
  s.push(['derniere_erreur', 'text', '', 'Dernière erreur d\'envoi (auto)', false]);
  s.push(['derniere_erreur_msg', 'text', '', 'Texte de la dernière erreur signalée par email (auto)', false]);
  s.push(['recap_dernier', 'text', '', 'Mois du dernier récapitulatif envoyé (auto)', false]);
  s.push(['actions_signalees', 'text', '', 'Actions déjà signalées par email (auto)', false]);
  s.push(['actions_dernier_envoi', 'text', '', 'Date du dernier email « Actions à faire » (auto)', false]);
  s.push(['releve_auto', 'bool', 'TRUE', 'Importer automatiquement les relevés de l\'agence reçus par email (PDF)', true]);
  s.push(['releve_expediteur', 'text', 'laforet.com', 'Adresse ou domaine de l\'expéditeur des relevés d\'agence', true]);
  s.push(['releves_mails_traites', 'text', '', 'Emails de relevés déjà traités (auto)', false]);
  s.push(['releve_derniere_lecture', 'text', '', 'Dernière lecture automatique d\'un relevé (auto)', false]);
  s.push(['comptes_sync', 'bool', 'TRUE', 'Envoyer le total net des loyers du mois dans l\'appli Comptes (ligne « Loyers France »)', true]);
  s.push(['comptes_depuis', 'text', '2026-08', 'Premier mois synchronisé avec l\'appli Comptes (aaaa-mm)', false]);
  s.push(['comptes_derniere_sync', 'text', '', 'Dernière mise à jour de l\'appli Comptes (auto)', false]);
  s.push(['impots_sync', 'bool', 'TRUE', 'Écrire le résultat foncier mensuel dans le fichier « Déclarations impôts » (colonne Loyers France)', true]);
  s.push(['impots_depuis', 'text', '2026', 'Première année mise à jour dans le fichier impôts (les années déjà déclarées ne sont pas touchées)', false]);
  s.push(['token', 'text', '', 'CODE SECRET de l\'application — ne pas partager', false]);
  return s;
}


/* ================================================================
 *  INSTALLATION
 * ================================================================ */
function installer() {
  const ss = getSS_();
  const tz = Session.getScriptTimeZone();
  const aujourdHui = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  // --- Paramètres ---
  let sh = ss.getSheetByName(FEUILLE_PARAMS);
  if (!sh) {
    sh = ss.insertSheet(FEUILLE_PARAMS);
    sh.getRange('A1:C1').setValues([['Clé', 'Valeur', 'Description']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 420); sh.setColumnWidth(3, 420);
  }
  sh.getRange('B:B').setNumberFormat('@').setWrap(true);

  const existants = lireParamsBruts_(sh);
  const envoi = ss.getSheetByName(FEUILLE_ENVOI);
  const initial = {};
  Object.keys(LOGEMENTS).forEach(function (id) {
    const c = LOGEMENTS[id].anciennesCases;
    initial[id + '.quittance_active'] = envoi.getRange(c.quittance).getValue() !== '' ? 'TRUE' : 'FALSE';
    initial[id + '.assurance_active'] = envoi.getRange(c.assurance).getValue() !== '' ? 'TRUE' : 'FALSE';
    initial[id + '.assurance_envoyee'] = aujourdHui; // évite un envoi immédiat à l'installation
    initial[id + '.assurance_recue'] = aujourdHui.slice(0, 4); // pas de relance l'année de l'installation
  });
  initial.token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  const b3 = String(envoi.getRange('B3').getValue()).trim();
  if (b3) initial.copie_cachee = b3;

  const aAjouter = [];
  schema_().forEach(function (def) {
    if (!(def[0] in existants)) {
      const v = (def[0] in initial) ? initial[def[0]] : def[2];
      aAjouter.push([def[0], v, def[3]]);
    }
  });
  if (aAjouter.length) sh.getRange(sh.getLastRow() + 1, 1, aAjouter.length, 3).setValues(aAjouter);

  // --- Paiements ---
  let sp = ss.getSheetByName(FEUILLE_PAIEMENTS);
  if (!sp) {
    sp = ss.insertSheet(FEUILLE_PAIEMENTS);
    sp.getRange('A1:H1').setValues([['Logement', 'Période', 'Montant', 'Date réception', 'Validé le', 'Quittance envoyée le', 'PDF', 'Remarque']])
      .setFontWeight('bold');
    sp.setFrozenRows(1);
    sp.getRange('A:H').setNumberFormat('@');
  }

  // --- Déclencheurs ---
  const obsoletes = ['verifierEnvoiEmailQuittances', 'verifierEnvoiEmailAssurances', 'executeAssuranceFunctions', 'tacheAutomatique'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (obsoletes.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tacheAutomatique').timeBased().everyHours(1).create();

  const token = lireParams_().token;
  const msg = 'Installation terminée.\n\nCODE SECRET à saisir dans l\'application :\n\n' + token +
    '\n\nÉtape suivante : Déployer > Nouveau déploiement > Application Web (Exécuter en tant que : Moi, Accès : Tout le monde).';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* exécuté depuis l'éditeur */ }
}


/* ================================================================
 *  TÂCHE AUTOMATIQUE (toutes les heures)
 * ================================================================ */
function tacheAutomatique() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const P = lireParams_();
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const jour = Number(Utilities.formatDate(now, tz, 'd'));
    const heure = Number(Utilities.formatDate(now, tz, 'H'));
    const mois = Number(Utilities.formatDate(now, tz, 'M'));
    const annee = Number(Utilities.formatDate(now, tz, 'yyyy'));
    const periode = Utilities.formatDate(now, tz, 'yyyy-MM');
    const erreurs = [];
    try { majLocataires_(); } catch (err) { erreurs.push('Locataires : ' + err.message); }

    Object.keys(LOGEMENTS).forEach(function (id) {
      const L = LOGEMENTS[id];
      if (estAgence_(P, id)) return; // géré par l'agence : rien d'automatique

      // ---- Quittance du mois ----
      if (bool_(P[id + '.quittance_active']) && echeanceAtteinte_(P, jour, heure, annee, mois)) {
        try {
          const p = trouverPaiement_(id, periode);
          if (p && p.valide_le && !p.quittance_le) {
            envoyerQuittance_(id, periode);
          } else if ((!p || !p.valide_le) && P[id + '.alerte_periode'] !== periode) {
            if (bool_(P.notif_loyer)) notifierLoyer_(P, id, periode, false);
            ecrireParam_(id + '.alerte_periode', periode);
          }
        } catch (err) { erreurs.push(L.libelle + ' (quittance) : ' + err.message); }
      }

      // ---- Rappel au locataire si loyer impayé ----
      if (bool_(P[id + '.quittance_active']) && bool_(P[id + '.rappel_impaye']) && P[id + '.rappel_periode'] !== periode) {
        try {
          const ech = dateEcheance_(P, periode);
          const limite = new Date(ech.getTime() + Number(P.rappel_impaye_jours || 5) * 86400000);
          const p = trouverPaiement_(id, periode);
          if (now >= limite && (!p || !p.valide_le)) envoyerRappelLoyer_(id, periode);
        } catch (err) { erreurs.push(L.libelle + ' (rappel loyer) : ' + err.message); }
      }

      // ---- Notifications à Chris : rappel de validation, quittance bloquée ----
      if (bool_(P[id + '.quittance_active'])) {
        try {
          const ech = dateEcheance_(P, periode);
          const p = trouverPaiement_(id, periode);
          const nj = Number(P.notif_loyer_rappel_jours || 0);
          if (bool_(P.notif_loyer) && nj > 0 && (!p || !p.valide_le) && P[id + '.alerte_rappel_periode'] !== periode &&
              now >= new Date(ech.getTime() + nj * 86400000)) {
            notifierLoyer_(P, id, periode, true);
            ecrireParam_(id + '.alerte_rappel_periode', periode);
          }
          if (bool_(P.notif_quittance_bloquee) && p && p.valide_le && !p.quittance_le &&
              P[id + '.alerte_bloquee_periode'] !== periode && now >= new Date(ech.getTime() + 3 * 3600000)) {
            notifierBloquee_(P, id, periode);
            ecrireParam_(id + '.alerte_bloquee_periode', periode);
          }
        } catch (err) { erreurs.push(L.libelle + ' (notification) : ' + err.message); }
      }

      // ---- Assurance annuelle + relances ----
      if (bool_(P[id + '.assurance_active'])) {
        try {
          const envoyee = String(P[id + '.assurance_envoyee'] || '');
          const anneeEnvoi = envoyee ? Number(envoyee.slice(0, 4)) : 0;
          const dateDemande = new Date(annee, Number(P.assurance_mois) - 1, Number(P.assurance_jour), Number(P.quittance_heure));
          if (anneeEnvoi < annee && now >= dateDemande) {
            envoyerAssurance_(id, false);
          } else if (bool_(P.relance_active) && anneeEnvoi === annee &&
                     String(P[id + '.assurance_recue']) !== String(annee)) {
            const derniere = P[id + '.derniere_relance'] || envoyee;
            const jours = (now - parseDate_(derniere)) / 86400000;
            if (jours >= Number(P.relance_jours || 15)) envoyerAssurance_(id, true);
          }
        } catch (err) { erreurs.push(L.libelle + ' (assurance) : ' + err.message); }

        // Email à Chris : « as-tu reçu l'attestation ? »
        try {
          const P2 = lireParams_();
          const env = String(P2[id + '.assurance_envoyee'] || '');
          if (bool_(P2.notif_attestation) && env && Number(env.slice(0, 4)) === annee &&
              String(P2[id + '.assurance_recue']) !== String(annee)) {
            const delai = Math.max(1, Number(P2.notif_attestation_jours || 7));
            const base = P2[id + '.alerte_attestation'] || env;
            if ((now - parseDate_(base)) / 86400000 >= delai) {
              notifierAttestation_(P2, id);
              ecrireParam_(id + '.alerte_attestation', Utilities.formatDate(now, tz, 'yyyy-MM-dd'));
            }
          }
        } catch (err) { erreurs.push(L.libelle + ' (notification attestation) : ' + err.message); }
      }
    });

    // ---- Relevés d'agence reçus par email ----
    if (bool_(P.releve_auto) && Object.keys(LOGEMENTS).some(function (id) { return estAgence_(P, id); })) {
      try { importerRelevesEmail_(); } catch (err) { erreurs.push('Relevé d\'agence : ' + err.message); }
    }

    // ---- Total des loyers vers l'appli Comptes ----
    if (bool_(lireParams_().comptes_sync)) {
      try { synchroniserComptes_(); } catch (err) { erreurs.push('Appli Comptes : ' + err.message); }
    }

    // ---- Email « Actions à faire » (au plus un par jour, seulement s'il y a du nouveau) ----
    try {
      const P3 = lireParams_();
      const aujIso = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
      if (bool_(P3.notif_actions) && heure >= 8 && P3.actions_dernier_envoi !== aujIso) {
        const actions = actionsEnAttente_(P3, now);
        const deja = String(P3.actions_signalees || '').split('|').filter(String);
        const nouvelles = actions.filter(function (a) { return deja.indexOf(a.cle) < 0; });
        if (nouvelles.length) {
          envoyerActions_(P3, actions, nouvelles);
          ecrireParam_('actions_dernier_envoi', aujIso);
        }
        ecrireParam_('actions_signalees', actions.map(function (a) { return a.cle; }).join('|'));
      }
    } catch (err) { erreurs.push('Email actions à faire : ' + err.message); }

    // ---- Récapitulatif mensuel (le 1er du mois) ----
    if (bool_(P.recap_mensuel) && jour === 1 && heure >= 8 && P.recap_dernier !== periode) {
      try {
        envoyerRecap_(lireParams_(), periode);
        ecrireParam_('recap_dernier', periode);
      } catch (err) { erreurs.push('Récapitulatif : ' + err.message); }
    }

    if (erreurs.length) {
      const msg = erreurs.join(' | ');
      const texte = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm') + ' — ' + msg;
      ecrireParam_('derniere_erreur', texte);
      if (P.derniere_erreur_msg !== msg) {
        notifier_(P, 'Erreur d\'envoi', 'Un envoi automatique a échoué',
          ['Le script n\'a pas pu terminer une tâche automatique. Il réessaiera toutes les heures.'],
          [['Détail', msg], ['Quand', Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm')]],
          'Ouvrir l\'application', 'accueil',
          'Vérifie l\'adresse du locataire dans Réglages, puis touche « Effacer » sur le bandeau d\'erreur.');
        ecrireParam_('derniere_erreur_msg', msg);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

function dateEcheance_(P, periode) {
  const a = Number(periode.slice(0, 4)), m = Number(periode.slice(5, 7));
  const dernier = new Date(a, m, 0).getDate();
  return new Date(a, m - 1, Math.min(Number(P.quittance_jour || 10), dernier), Number(P.quittance_heure || 12));
}

function envoyerRappelLoyer_(id, periode) {
  const P = lireParams_();
  const L = LOGEMENTS[id];
  const loc = locataire_(id);
  if (!loc.email) throw new Error('aucune adresse email pour ' + L.libelle);
  const mp = moisDePeriode_(periode);
  const vars = variables_(P, id, loc, mp);
  const options = { name: P.signature || 'Christophe SOULAS' };
  const cc = String(P[id + '.email2'] || '').trim();
  const bcc = String(P.copie_cachee || '').trim();
  if (cc) options.cc = cc;
  if (bcc) options.bcc = bcc;
  GmailApp.sendEmail(loc.email, remplir_(P.objet_rappel_loyer, vars), remplir_(P.corps_rappel_loyer, vars), options);
  const tz = Session.getScriptTimeZone();
  journaliser_('- ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + ' : ' + L.libelle.toUpperCase() + ' Rappel loyer ' + mp.mois + ' ' + mp.annee + ' ' + loc.nom + ' ' + loc.prenom, '');
  ecrireParam_(id + '.rappel_periode', periode);
}

function echeanceAtteinte_(P, jour, heure, annee, mois) {
  const dernierJour = new Date(annee, mois, 0).getDate();
  const jq = Math.min(Number(P.quittance_jour || 10), dernierJour);
  return jour > jq || (jour === jq && heure >= Number(P.quittance_heure || 12));
}


/* ================================================================
 *  ENVOIS
 * ================================================================ */
function envoyerQuittance_(id, periode) {
  const ss = getSS_();
  const L = LOGEMENTS[id];
  const P = lireParams_();
  const loc = locataire_(id);
  if (!loc.email) throw new Error('aucune adresse email pour ' + L.libelle);

  const p = trouverPaiement_(id, periode);
  if (!p || !p.valide_le) throw new Error('paiement ' + periode + ' non validé');

  const mp = moisDePeriode_(periode);
  const jourPaiement = p.date_reception ? Number(p.date_reception.slice(8, 10)) : new Date().getDate();
  const tz = Session.getScriptTimeZone();
  const jourIso = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const nomFichier = '- ' + jourIso + ' : ' + L.libelle.toUpperCase() + ' Quittance ' + mp.mois + ' ' + mp.annee + ' ' + loc.nom + ' ' + loc.prenom;

  const pdf = avecQuittancePreparee_(ss.getSheetByName(L.feuilleQuittance), mp, jourPaiement, function (feuille) {
    return exporterPdf_(ss, feuille, nomFichier);
  });

  const fichier = DriveApp.createFile(pdf).moveTo(DriveApp.getFolderById(DOSSIER_QUITTANCES));
  journaliser_(nomFichier, fichier.getUrl());

  const vars = variables_(P, id, loc, mp);
  envoyerMail_(P, id, loc.email, remplir_(P.objet_quittance, vars), remplir_(P.corps_quittance, vars), pdf);

  majPaiement_(id, periode, { quittance_le: horodatage_(), pdf: fichier.getUrl() });
  return fichier.getUrl();
}

function envoyerAssurance_(id, relance) {
  const ss = getSS_();
  const L = LOGEMENTS[id];
  const P = lireParams_();
  const loc = locataire_(id);
  if (!loc.email) throw new Error('aucune adresse email pour ' + L.libelle);

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const jourIso = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const mp = { mois: MOIS[now.getMonth()], annee: now.getFullYear() };
  const nomFichier = '- ' + jourIso + ' : ' + L.libelle.toUpperCase() + (relance ? ' Relance assurance ' : ' Assurance location ') + loc.nom + ' ' + loc.prenom;

  const pdf = exporterPdf_(ss, ss.getSheetByName(L.feuilleAssurance), nomFichier);
  const fichier = DriveApp.createFile(pdf).moveTo(DriveApp.getFolderById(DOSSIER_ASSURANCES));
  journaliser_(nomFichier, fichier.getUrl());

  const vars = variables_(P, id, loc, mp);
  const objet = remplir_(relance ? P.objet_relance : P.objet_assurance, vars);
  const corps = remplir_(relance ? P.corps_relance : P.corps_assurance, vars);
  envoyerMail_(P, id, loc.email, objet, corps, pdf);

  if (relance) {
    ecrireParam_(id + '.derniere_relance', jourIso);
  } else {
    ecrireParam_(id + '.assurance_envoyee', jourIso);
    ecrireParam_(id + '.derniere_relance', '');
  }
  return fichier.getUrl();
}

function envoyerMail_(P, id, destinataire, objet, corps, pdf) {
  const options = { attachments: [pdf], name: P.signature || 'Christophe SOULAS' };
  const cc = String(P[id + '.email2'] || '').trim();
  const bcc = String(P.copie_cachee || '').trim();
  if (cc) options.cc = cc;
  if (bcc) options.bcc = bcc;
  GmailApp.sendEmail(destinataire, objet, corps, options);
}

// ---------- Notifications par email (à Chris) ----------
function lienApp_(P, hash) {
  const base = String(P.app_url || 'https://chrissorbadere.github.io/Loyers/index.html').split('#')[0];
  return base + (hash ? '#' + hash : '');
}

function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// titre court (objet), accroche (titre du mail), paragraphes, lignes [libellé, valeur], bouton, lien, conseil
function notifier_(P, objet, titre, paragraphes, lignes, bouton, hash, conseil) {
  if (!bool_(P.alertes_actives)) return;
  const dest = String(P.email_alertes || '').trim();
  if (!dest) return;
  const url = lienApp_(P, hash);
  const texte = titre + '\n\n' + paragraphes.join('\n\n') + '\n\n' +
    (lignes || []).map(function (l) { return '- ' + l[0] + ' : ' + l[1]; }).join('\n') +
    (conseil ? '\n\n' + conseil : '') + '\n\n' + bouton + ' : ' + url + '\n';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#F4F1EA;padding:24px 12px">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px;border:1px solid #E2DDD2">' +
    '<div style="font-size:13px;color:#6E695F;margin-bottom:6px">Mes Locations</div>' +
    '<h1 style="font-size:21px;line-height:1.3;color:#1D1C19;margin:0 0 14px">' + escHtml_(titre) + '</h1>' +
    paragraphes.map(function (p) { return '<p style="font-size:15px;line-height:1.5;color:#1D1C19;margin:0 0 12px">' + escHtml_(p) + '</p>'; }).join('') +
    ((lignes && lignes.length) ? '<table style="width:100%;border-collapse:collapse;margin:6px 0 16px;font-size:14px">' +
      lignes.map(function (l) {
        return '<tr><td style="padding:8px 0;border-top:1px solid #E2DDD2;color:#6E695F">' + escHtml_(l[0]) +
               '</td><td style="padding:8px 0;border-top:1px solid #E2DDD2;color:#1D1C19;font-weight:bold;text-align:right">' + escHtml_(l[1]) + '</td></tr>';
      }).join('') + '</table>' : '') +
    '<a href="' + escHtml_(url) + '" style="display:inline-block;background:#1F6B57;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:12px">' + escHtml_(bouton) + '</a>' +
    (conseil ? '<p style="font-size:13px;line-height:1.5;color:#6E695F;margin:16px 0 0">' + escHtml_(conseil) + '</p>' : '') +
    '</div><p style="text-align:center;font-size:12px;color:#9C978C;margin:12px 0 0">Email automatique · réglable dans Mes Locations › Réglages › Notifications</p></div>';
  GmailApp.sendEmail(dest, '[Mes Locations] ' + objet, texte, { htmlBody: html, name: 'Mes Locations' });
}

function de_(mot) { return /^[aeiouyhé]/i.test(mot) ? 'd\'' : 'de '; }

function euroTxt_(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

function notifierLoyer_(P, id, periode, rappel) {
  const L = LOGEMENTS[id];
  const loc = locataire_(id);
  const mp = moisDePeriode_(periode);
  const ech = dateEcheance_(P, periode);
  const tz = Session.getScriptTimeZone();
  notifier_(P,
    (rappel ? 'Rappel : loyer ' : 'Loyer ') + mp.mois + ' à valider — ' + L.libelle,
    (rappel ? 'Le loyer ' : 'As-tu reçu le loyer ') + de_(mp.mois) + mp.mois + ' ' + mp.annee + (rappel ? ' n\'est toujours pas validé' : ' ?'),
    [rappel
      ? 'L\'échéance est passée et le paiement n\'a pas encore été validé. La quittance reste en attente.'
      : 'C\'est le jour de l\'échéance. La quittance partira automatiquement dès que tu auras validé le paiement.',
     'Vérifie ton compte bancaire, puis valide le paiement dans l\'application (montant et date de réception).'],
    [['Logement', L.libelle], ['Locataire', (loc.civilite + ' ' + loc.prenom + ' ' + loc.nom).trim()],
     ['Loyer attendu', euroTxt_(loc.loyer)], ['Échéance', Utilities.formatDate(ech, tz, 'dd/MM/yyyy')]],
    'Valider le paiement', 'paiement/' + id + '/' + periode,
    bool_(P[id + '.rappel_impaye']) ? 'Si rien n\'est validé, un rappel courtois part au locataire ' + P.rappel_impaye_jours + ' jours après l\'échéance.' : '');
}

function notifierBloquee_(P, id, periode) {
  const L = LOGEMENTS[id];
  const loc = locataire_(id);
  const mp = moisDePeriode_(periode);
  notifier_(P,
    'Quittance ' + mp.mois + ' non envoyée — ' + L.libelle,
    'La quittance ' + de_(mp.mois) + mp.mois + ' ' + mp.annee + ' n\'est pas partie',
    ['Le paiement est validé, mais la quittance n\'a pas encore été envoyée au locataire.',
     'Cause probable : l\'envoi automatique est désactivé pour ce logement, ou l\'adresse email du locataire est absente ou erronée.'],
    [['Logement', L.libelle], ['Locataire', (loc.prenom + ' ' + loc.nom).trim()], ['Email du locataire', loc.email || '(vide)']],
    'Envoyer la quittance', 'paiement/' + id + '/' + periode,
    'Dans l\'application : ouvre le paiement et touche « Envoyer la quittance ».');
}

function notifierAttestation_(P, id) {
  const L = LOGEMENTS[id];
  const loc = locataire_(id);
  const annee = new Date().getFullYear();
  const env = parseDate_(P[id + '.assurance_envoyee']);
  const rel = P[id + '.derniere_relance'] ? parseDate_(P[id + '.derniere_relance']) : null;
  const tz = Session.getScriptTimeZone();
  const lignes = [['Logement', L.libelle], ['Locataire', (loc.prenom + ' ' + loc.nom).trim()],
                  ['Demande envoyée le', Utilities.formatDate(env, tz, 'dd/MM/yyyy')]];
  if (rel) lignes.push(['Dernière relance', Utilities.formatDate(rel, tz, 'dd/MM/yyyy')]);
  notifier_(P,
    'Attestation ' + annee + ' à confirmer — ' + L.libelle,
    'As-tu reçu l\'attestation d\'assurance ' + annee + ' ?',
    ['La demande d\'attestation a été envoyée au locataire, mais sa réception n\'est pas encore confirmée.',
     'Si tu l\'as reçue (par email ou courrier), confirme-le dans l\'application : les relances s\'arrêteront.'],
    lignes, 'Confirmer la réception', 'attestation/' + id,
    bool_(P.relance_active) ? 'Sans confirmation, une relance part automatiquement au locataire tous les ' + P.relance_jours + ' jours.' : '');
}

function envoyerRecap_(P, periode) {
  const tz = Session.getScriptTimeZone();
  const precedente = Utilities.formatDate(new Date(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)) - 2, 1), tz, 'yyyy-MM');
  const mp = moisDePeriode_(precedente);
  const annee = periode.slice(0, 4);
  const pays = lirePaiements_();
  const lignes = [];
  const aFaire = [];
  let totalAnnee = 0;
  pays.forEach(function (p) {
    if (p.valide_le && p.periode.slice(0, 4) === annee) totalAnnee += Number(String(p.montant).replace(',', '.')) || 0;
  });
  Object.keys(LOGEMENTS).forEach(function (id) {
    const L = LOGEMENTS[id];
    if (estAgence_(P, id)) {
      const pa = pays.filter(function (x) { return x.logement === id && x.periode === precedente; })[0];
      lignes.push([L.libelle + ' — loyer ' + de_(mp.mois) + mp.mois + ' (agence)', pa && pa.valide_le ? euroTxt_(String(pa.montant).replace(',', '.')) : 'relevé non saisi']);
      if (!pa || !pa.valide_le) aFaire.push('Saisir le relevé d\'agence ' + de_(mp.mois) + mp.mois + ' (' + L.libelle + ').');
      return;
    }
    if (!bool_(P[id + '.quittance_active'])) return;
    const p = pays.filter(function (x) { return x.logement === id && x.periode === precedente; })[0];
    lignes.push([L.libelle + ' — loyer ' + de_(mp.mois) + mp.mois,
      p && p.valide_le ? euroTxt_(String(p.montant).replace(',', '.')) + (p.quittance_le ? ' · quittance envoyée' : ' · quittance NON envoyée') : 'non validé']);
    if (!p || !p.valide_le) aFaire.push('Valider le loyer ' + de_(mp.mois) + mp.mois + ' (' + L.libelle + ').');
    else if (!p.quittance_le) aFaire.push('Envoyer la quittance ' + de_(mp.mois) + mp.mois + ' (' + L.libelle + ').');
  });
  Object.keys(LOGEMENTS).forEach(function (id) {
    if (!estAgence_(P, id) && bool_(P[id + '.assurance_active']) && String(P[id + '.assurance_envoyee'] || '').slice(0, 4) === annee &&
        String(P[id + '.assurance_recue']) !== annee) {
      aFaire.push('Confirmer la réception de l\'attestation d\'assurance ' + annee + ' (' + LOGEMENTS[id].libelle + ').');
    }
  });
  if (P.derniere_erreur) aFaire.push('Vérifier la dernière erreur d\'envoi : ' + P.derniere_erreur);
  lignes.push(['Encaissé en ' + annee + ' (paiements validés)', euroTxt_(totalAnnee)]);
  notifier_(P,
    'Récapitulatif ' + de_(mp.mois) + mp.mois + ' ' + mp.annee,
    'Récapitulatif ' + de_(mp.mois) + mp.mois + ' ' + mp.annee,
    aFaire.length ? ['À faire :'].concat(aFaire.map(function (t) { return '• ' + t; })) : ['Tout est à jour : aucune action en attente.'],
    lignes, 'Ouvrir Mes Locations', aFaire.length ? 'accueil' : 'bilan', '');
}

// Liste des actions en attente (même logique que le bloc « À faire » de l'application)
function actionsEnAttente_(P, now) {
  const tz = Session.getScriptTimeZone();
  const per = Utilities.formatDate(now, tz, 'yyyy-MM');
  const d = new Date(Number(per.slice(0, 4)), Number(per.slice(5, 7)) - 2, 1);
  const prec = Utilities.formatDate(d, tz, 'yyyy-MM');
  const pays = lirePaiements_();
  const trouve = function (id, pe) { return pays.filter(function (x) { return x.logement === id && x.periode === pe; })[0]; };
  const fmt = function (dt) { return Utilities.formatDate(dt, tz, 'dd/MM/yyyy'); };
  const out = [];
  Object.keys(LOGEMENTS).forEach(function (id) {
    const L = LOGEMENTS[id];
    const anterieur = function (pe) { return pays.some(function (x) { return x.logement === id && x.periode < pe; }); };
    if (estAgence_(P, id)) {
      [prec, per].forEach(function (pe) {
        const p = trouve(id, pe);
        if (p && p.valide_le) return;
        if (pe === prec && !anterieur(prec)) return;
        const niveau = (pe === prec || now.getDate() >= 22) ? 'orange' : 'a-venir';
        const mp = moisDePeriode_(pe);
        out.push({ cle: 'releve:' + id + ':' + pe + ':' + niveau, niveau: niveau,
          titre: 'Relevé d\'agence ' + de_(mp.mois) + mp.mois + ' à saisir — ' + L.libelle,
          detail: niveau === 'orange' ? 'normalement reçu vers le 20' : 'à venir vers le 20 ' + mp.mois });
      });
      return;
    }
    if (bool_(P[id + '.quittance_active'])) {
      [prec, per].forEach(function (pe) {
        if (pe === prec && !anterieur(per)) return;
        const p = trouve(id, pe);
        const ech = dateEcheance_(P, pe);
        const j = Math.ceil((ech - now) / 86400000);
        const mp = moisDePeriode_(pe);
        if (!p || !p.valide_le) {
          const niveau = j <= 0 ? 'rouge' : j <= 7 ? 'orange' : 'a-venir';
          out.push({ cle: 'loyer:' + id + ':' + pe + ':' + niveau, niveau: niveau,
            titre: 'Loyer ' + de_(mp.mois) + mp.mois + ' à valider — ' + L.libelle,
            detail: euroTxt_(locataire_(id).loyer) + ' · ' + (j <= 0 ? 'échéance passée le ' : 'échéance le ') + fmt(ech) });
        } else if (!p.quittance_le && ech <= now) {
          out.push({ cle: 'quittance:' + id + ':' + pe, niveau: 'orange',
            titre: 'Quittance ' + de_(mp.mois) + mp.mois + ' à envoyer — ' + L.libelle, detail: 'paiement validé, quittance pas encore partie' });
        }
      });
    }
    const annee = now.getFullYear();
    if (bool_(P[id + '.assurance_active']) && String(P[id + '.assurance_envoyee'] || '').slice(0, 4) === String(annee) &&
        String(P[id + '.assurance_recue']) !== String(annee)) {
      out.push({ cle: 'attestation:' + id + ':' + annee, niveau: 'orange',
        titre: 'Attestation d\'assurance ' + annee + ' à confirmer — ' + L.libelle, detail: 'demandée le ' + fmt(parseDate_(P[id + '.assurance_envoyee'])) });
    }
  });
  if (P.derniere_erreur) out.push({ cle: 'erreur:' + String(P.derniere_erreur).length, niveau: 'rouge', titre: 'Erreur d\'envoi à vérifier', detail: String(P.derniere_erreur).slice(0, 140) });
  const ordre = { 'rouge': 0, 'orange': 1, 'a-venir': 2 };
  return out.sort(function (a, b) { return ordre[a.niveau] - ordre[b.niveau]; });
}

function envoyerActions_(P, actions, nouvelles) {
  const marque = { 'rouge': '🔴 ', 'orange': '🟠 ', 'a-venir': '🔵 ' };
  const cles = nouvelles.map(function (a) { return a.cle; });
  notifier_(P,
    actions.length + ' action' + (actions.length > 1 ? 's' : '') + ' à faire' + (nouvelles.length ? ' (' + nouvelles.length + ' nouvelle' + (nouvelles.length > 1 ? 's' : '') + ')' : ''),
    actions.length > 1 ? actions.length + ' actions t\'attendent dans Mes Locations' : 'Une action t\'attend dans Mes Locations',
    ['Voici ce qui est en attente. Les nouveautés depuis le dernier email sont marquées « Nouveau ».'],
    actions.map(function (a) { return [marque[a.niveau] + (cles.indexOf(a.cle) >= 0 ? 'Nouveau · ' : '') + a.titre, a.detail]; }),
    'Ouvrir « À faire »', 'accueil',
    '🔴 urgent · 🟠 dans les 7 jours · 🔵 à venir. Un seul email par jour au plus, et seulement s\'il y a du nouveau.');
}

// Compatibilité : ancienne fonction d'alerte texte
function alerte_(P, sujet, texte) {
  notifier_(P, sujet, sujet, [texte], [], 'Ouvrir l\'application', 'accueil', '');
}

// Force le mois et le jour de paiement sur la feuille quittance le temps de l'export
function avecQuittancePreparee_(feuille, mp, jourPaiement, fn) {
  const sauvegarde = CELLULES_MOIS_QUITTANCE.map(function (a) {
    const r = feuille.getRange(a);
    return { a: a, f: r.getFormula(), v: r.getValue() };
  });
  const c26 = feuille.getRange(CELLULE_JOUR_PAIEMENT).getValue();
  const libelle = (mp.mois + ' ' + mp.annee).toUpperCase();
  try {
    CELLULES_MOIS_QUITTANCE.forEach(function (a) { feuille.getRange(a).setFormula('="' + libelle + '"'); });
    feuille.getRange(CELLULE_JOUR_PAIEMENT).setValue(jourPaiement);
    SpreadsheetApp.flush();
    return fn(feuille);
  } finally {
    sauvegarde.forEach(function (s) {
      const r = feuille.getRange(s.a);
      if (s.f) r.setFormula(s.f); else r.setValue(s.v);
    });
    feuille.getRange(CELLULE_JOUR_PAIEMENT).setValue(c26);
    SpreadsheetApp.flush();
  }
}

function exporterPdf_(ss, feuille, nom) {
  const url = ss.getUrl().replace(/\/edit.*$/, '')
    + '/export?exportformat=pdf&format=pdf'
    + '&size=LETTER&portrait=true&fitw=true'
    + '&top_margin=0.50&bottom_margin=0.50&left_margin=0.50&right_margin=0.50'
    + '&sheetnames=false&printtitle=false&pagenum=false&gridlines=false&fzr=FALSE'
    + '&gid=' + feuille.getSheetId();
  const rep = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (rep.getResponseCode() !== 200) throw new Error('export PDF impossible (HTTP ' + rep.getResponseCode() + ')');
  return rep.getBlob().setName(nom + '.pdf');
}


/* ================================================================
 *  API POUR L'APPLICATION (doPost)
 * ================================================================ */
function doGet() {
  return ContentService.createTextOutput('Mes Locations — API active');
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Requête invalide' }); }

  const P = lireParams_();
  if (!P.token || req.token !== P.token) return json_({ ok: false, error: 'Code secret incorrect' });

  const lock = LockService.getScriptLock();
  const ecriture = req.action !== 'etat' && req.action !== 'apercu';
  if (ecriture && !lock.tryLock(30000)) return json_({ ok: false, error: 'Un envoi est déjà en cours, réessaie dans un instant.' });

  try {
    let data = executer_(req);
    if (['validerPaiement', 'annulerPaiement', 'ajouterReleve', 'supprimerReleve', 'importerRelevesEmail'].indexOf(req.action) >= 0 &&
        bool_(lireParams_().comptes_sync)) {
      try { synchroniserComptes_(); } catch (err) { /* réessayé au prochain passage horaire */ }
    }
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    if (ecriture) lock.releaseLock();
  }
}

function executer_(req) {
  const id = req.logement;
  if (id && !LOGEMENTS[id] && !(id === 'commun' && req.action === 'ajouterDepense')) throw new Error('Logement inconnu');
  if (['envoyerQuittance', 'envoyerAssurance', 'rappelLoyer'].indexOf(req.action) >= 0 && estAgence_(lireParams_(), id)) {
    throw new Error('Ce logement est géré par l\'agence : aucun envoi au locataire depuis l\'application');
  }

  switch (req.action) {
    case 'etat':
      return etat_();

    case 'parametres': {
      const modifiables = {};
      schema_().forEach(function (d) { if (d[4]) modifiables[d[0]] = d[1]; });
      Object.keys(req.valeurs || {}).forEach(function (k) {
        if (!(k in modifiables)) return;
        let v = req.valeurs[k];
        if (modifiables[k] === 'bool') v = v ? 'TRUE' : 'FALSE';
        ecrireParam_(k, String(v));
      });
      // Emails locataires -> feuille Principale
      Object.keys(req.emails || {}).forEach(function (lid) {
        if (LOGEMENTS[lid]) principale_().getRange(LOGEMENTS[lid].cellules.email).setValue(String(req.emails[lid]).trim());
      });
      return etat_();
    }

    case 'validerPaiement': {
      if (!/^\d{4}-\d{2}$/.test(req.periode || '')) throw new Error('Période invalide');
      majPaiement_(id, req.periode, {
        montant: String(req.montant),
        date_reception: req.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        valide_le: horodatage_(),
        remarque: req.remarque || ''
      });
      if (req.envoyer) envoyerQuittance_(id, req.periode);
      return etat_();
    }

    case 'annulerPaiement': {
      const p = trouverPaiement_(id, req.periode);
      if (!p) throw new Error('Aucun paiement à annuler');
      if (p.quittance_le) throw new Error('La quittance a déjà été envoyée : annulation impossible');
      feuillePaiements_().deleteRow(p.ligne);
      return etat_();
    }

    case 'envoyerQuittance':
      envoyerQuittance_(id, req.periode);
      return etat_();

    case 'envoyerAssurance':
      envoyerAssurance_(id, !!req.relance);
      return etat_();

    case 'assuranceRecue':
      ecrireParam_(id + '.assurance_recue', req.recue ? String(new Date().getFullYear()) : '');
      return etat_();

    case 'effacerErreur':
      ecrireParam_('derniere_erreur', '');
      return etat_();

    case 'apercu': {
      const ss = getSS_();
      const L = LOGEMENTS[id];
      let blob;
      if (req.type === 'assurance') {
        blob = exporterPdf_(ss, ss.getSheetByName(L.feuilleAssurance), 'apercu');
      } else {
        const per = req.periode || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
        const p = trouverPaiement_(id, per);
        const jour = p && p.date_reception ? Number(p.date_reception.slice(8, 10)) : new Date().getDate();
        blob = avecQuittancePreparee_(ss.getSheetByName(L.feuilleQuittance), moisDePeriode_(per), jour, function (f) {
          return exporterPdf_(ss, f, 'apercu');
        });
      }
      return { base64: Utilities.base64Encode(blob.getBytes()) };
    }

    case 'rappelLoyer':
      envoyerRappelLoyer_(id, req.periode || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'));
      return etat_();

    case 'ajouterReleve':
      if (req.remplacer) relevesCouvrant_(id, (req.lignes || []).map(function (l) { return l.periode; }))
        .forEach(function (r) { supprimerReleve_(r.id); });
      ajouterReleve_(req);
      return etat_();

    case 'analyserReleve': {
      if (!req.pdf || !req.pdf.base64) throw new Error('Aucun PDF reçu');
      const blob = Utilities.newBlob(Utilities.base64Decode(String(req.pdf.base64)), 'application/pdf', 'releve.pdf');
      const r = lireCompteRendu_(texteDuPdf_(blob));
      r.existants = relevesCouvrant_(id, r.lignes.map(function (l) { return l.periode; })).map(function (x) { return x.id; });
      return r;
    }

    case 'synchroniserComptes':
      synchroniserComptes_();
      return etat_();

    case 'importerRelevesEmail':
      return { resultat: importerRelevesEmail_() };

    case 'joindrePdfReleve':
      joindrePdfReleve_(String(req.id || ''), req.pdf);
      return etat_();

    case 'supprimerReleve':
      supprimerReleve_(String(req.id || ''));
      return etat_();

    case 'ajouterDepense': {
      const montant = Number(String(req.montant).replace(',', '.'));
      if (!(montant > 0)) throw new Error('Montant invalide');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date || '')) throw new Error('Date invalide');
      const sh = feuilleDepenses_();
      const ligne = [Utilities.getUuid().slice(0, 8), req.date, req.logement || 'commun', req.categorie || 'Autre',
        String(req.libelle || '').slice(0, 200), montant.toFixed(2), String(req.remarque || '').slice(0, 300)];
      sh.getRange(sh.getLastRow() + 1, 1, 1, ligne.length).setNumberFormat('@').setValues([ligne]);
      return etat_();
    }

    case 'supprimerDepense': {
      const sh = feuilleDepenses_();
      const n = sh.getLastRow();
      if (n >= 2) {
        const ids = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
        for (let i = 0; i < ids.length; i++) if (ids[i][0] === req.id) { sh.deleteRow(i + 2); break; }
      }
      return etat_();
    }

    case 'testNotification': {
      const P = lireParams_();
      if (!bool_(P.alertes_actives)) throw new Error('Les notifications sont désactivées (interrupteur général)');
      const id = Object.keys(LOGEMENTS).filter(function (k) { return bool_(P[k + '.quittance_active']); })[0] || 'trianon';
      notifierLoyer_(P, id, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'), false);
      return { envoye: true };
    }

    case 'test': {
      const P = lireParams_();
      GmailApp.sendEmail(P.email_alertes || Session.getEffectiveUser().getEmail(),
        '[Mes Locations] Email de test', 'La connexion entre l\'application et Google fonctionne.', { name: 'Mes Locations' });
      return { envoye: true };
    }

    default:
      throw new Error('Action inconnue');
  }
}

function etat_() {
  const P = lireParams_();
  const tz = Session.getScriptTimeZone();
  const params = {};
  schema_().forEach(function (d) {
    if (d[0] === 'token') return;
    let v = P[d[0]];
    if (d[1] === 'bool') v = bool_(v);
    else if (d[1] === 'num') v = Number(v);
    params[d[0]] = v === undefined ? '' : v;
  });

  const logements = Object.keys(LOGEMENTS).map(function (id) {
    const loc = locataire_(id);
    return {
      id: id, libelle: LOGEMENTS[id].libelle,
      civilite: loc.civilite, prenom: loc.prenom, nom: loc.nom, email: loc.email,
      loyer: loc.loyer, charges: loc.charges
    };
  });

  const paiements = lirePaiements_().map(function (p) {
    return { logement: p.logement, periode: p.periode, montant: p.montant, date_reception: p.date_reception,
             valide_le: p.valide_le, quittance_le: p.quittance_le, pdf: p.pdf, remarque: p.remarque, charges: p.charges };
  });

  // Journal (feuille Envoi email, colonnes H:J)
  const env = getSS_().getSheetByName(FEUILLE_ENVOI);
  const der = env.getLastRow();
  let journal = [];
  if (der >= 7) {
    journal = env.getRange(7, 8, der - 6, 3).getDisplayValues()
      .filter(function (r) { return r[0] && r[2]; })
      .map(function (r) { return { date: r[0], url: r[1], nom: r[2] }; })
      .reverse().slice(0, 150);
  }

  return {
    depenses: lireDepenses_(),
    releves: lireReleves_(),
    historique: lireHistorique_(),
    maintenant: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
    params: params, logements: logements, paiements: paiements, journal: journal
  };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}


/* ================================================================
 *  DONNÉES
 * ================================================================ */
function getSS_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SS_ID);
}
function principale_() { return getSS_().getSheetByName('Principale'); }
function feuillePaiements_() {
  const sh = getSS_().getSheetByName(FEUILLE_PAIEMENTS);
  if (!sh) throw new Error('Onglet « Paiements » absent : exécute la fonction installer');
  if (sh.getRange(1, 9).getValue() === '') sh.getRange(1, 9).setValue('Charges').setFontWeight('bold');
  return sh;
}

function locataire_(id) {
  const c = LOGEMENTS[id].cellules;
  const p = principale_();
  const val = function (a) { return p.getRange(a).getValue(); };
  return {
    civilite: String(val(c.civilite) || ''), prenom: String(val(c.prenom) || ''), nom: String(val(c.nom) || ''),
    email: String(val(c.email) || '').trim(), loyer: Number(val(c.loyer)) || 0, charges: Number(val(c.charges)) || 0
  };
}

function variables_(P, id, loc, mp) {
  return {
    civilite: loc.civilite, prenom: loc.prenom, nom: loc.nom,
    mois: mp.mois, annee: mp.annee,
    adresse: P[id + '.adresse'] || LOGEMENTS[id].adresse,
    commune: P[id + '.commune'] || '',
    signature: P.signature || '',
    montant: loc.loyer.toFixed(2).replace('.', ',') + ' €'
  };
}

function remplir_(modele, vars) {
  return String(modele || '').replace(/\{(\w+)\}/g, function (m, k) { return (k in vars) ? vars[k] : m; });
}

function moisDePeriode_(periode) {
  return { annee: Number(periode.slice(0, 4)), mois: MOIS[Number(periode.slice(5, 7)) - 1] };
}

function horodatage_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function parseDate_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(0);
}

function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }

function journaliser_(nom, url) {
  const tz = Session.getScriptTimeZone();
  getSS_().getSheetByName(FEUILLE_ENVOI).appendRow([null, null, null, null, null, null, null,
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd / HH:mm:ss'), url, nom]);
}

// ---------- Paramètres ----------
function lireParamsBruts_(sh) {
  const o = {};
  const n = sh.getLastRow();
  if (n < 2) return o;
  sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r, i) {
    if (r[0] !== '') o[r[0]] = { valeur: r[1], ligne: i + 2 };
  });
  return o;
}

function lireParams_() {
  const sh = getSS_().getSheetByName(FEUILLE_PARAMS);
  if (!sh) throw new Error('Onglet « Paramètres » absent : exécute la fonction installer');
  const bruts = lireParamsBruts_(sh);
  const o = {};
  schema_().forEach(function (d) { o[d[0]] = (d[0] in bruts) ? bruts[d[0]].valeur : d[2]; });
  return o;
}

function ecrireParam_(cle, valeur) {
  const sh = getSS_().getSheetByName(FEUILLE_PARAMS);
  const bruts = lireParamsBruts_(sh);
  if (cle in bruts) sh.getRange(bruts[cle].ligne, 2).setValue(valeur);
  else sh.appendRow([cle, valeur, '']);
}

// ---------- Gestion par agence (relevés de gestion) ----------
const FEUILLE_RELEVES = 'Relevés agence';
const COLS_RELEVE = ['id', 'logement', 'date', 'periodes', 'loyers', 'provisions', 'frais', 'net', 'pdf', 'remarque'];

function estAgence_(P, id) { return String(P[id + '.gestion'] || '').toLowerCase() === 'agence'; }

function feuilleReleves_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(FEUILLE_RELEVES);
  if (!sh) {
    sh = ss.insertSheet(FEUILLE_RELEVES);
    sh.getRange(1, 1, 1, COLS_RELEVE.length).setValues([['ID', 'Logement', 'Date du relevé', 'Période(s)', 'Loyers', 'Provisions/charges', 'Frais déduits', 'Net viré', 'PDF', 'Remarque']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:J').setNumberFormat('@');
  }
  return sh;
}

function lireReleves_() {
  const sh = getSS_().getSheetByName(FEUILLE_RELEVES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COLS_RELEVE.length).getDisplayValues()
    .map(function (r, i) {
      const o = { ligne: i + 2 };
      COLS_RELEVE.forEach(function (c, j) { o[c] = r[j]; });
      ['loyers', 'provisions', 'frais', 'net'].forEach(function (k) { o[k] = Number(String(o[k]).replace(',', '.')) || 0; });
      return o;
    }).filter(function (o) { return o.id; });
}

function dossierReleves_() {
  const parent = DriveApp.getFolderById(DOSSIER_QUITTANCES);
  const it = parent.getFoldersByName('Relevés agence');
  return it.hasNext() ? it.next() : parent.createFolder('Relevés agence');
}

function enregistrerPdf_(pdf, nomParDefaut) {
  if (!pdf || !pdf.base64) return '';
  const octets = Utilities.base64Decode(String(pdf.base64));
  if (octets.length > 10 * 1024 * 1024) throw new Error('PDF trop volumineux (10 Mo maximum)');
  const nom = String(pdf.nom || nomParDefaut).replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const blob = Utilities.newBlob(octets, 'application/pdf', /\.pdf$/i.test(nom) ? nom : nom + '.pdf');
  return dossierReleves_().createFile(blob).getUrl();
}

const CATEGORIES_FRAIS = ['Honoraires d\'agence', 'Assurance loyers impayés (GLI)', 'Travaux & entretien', 'Taxe foncière', 'Autre'];

// req = {logement, date (aaaa-mm-jj), lignes:[{periode, loyer, provisions}], frais:[{date?, categorie, libelle, montant}], net, remarque, pdf?}
function ajouterReleve_(req) {
  const id = req.logement;
  if (!LOGEMENTS[id]) throw new Error('Logement inconnu');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.date || '')) throw new Error('Date du relevé invalide');
  const lignes = (req.lignes || []).filter(function (l) { return /^\d{4}-\d{2}$/.test(l.periode || ''); });
  if (!lignes.length || lignes.length > 6) throw new Error('Indique au moins une période de loyer');
  const frais = (req.frais || []).filter(function (f) { return Number(f.montant) !== 0; }).slice(0, 20);
  if (lireReleves_().some(function (r) { return r.logement === id && r.date === req.date; })) {
    throw new Error('Un relevé du ' + req.date + ' existe déjà pour ce logement');
  }
  const num = function (v) { const n = Number(String(v).replace(',', '.')); if (!isFinite(n)) throw new Error('Montant invalide'); return n; };
  let loyers = 0, provisions = 0, totalFrais = 0;
  lignes.forEach(function (l) { loyers += num(l.loyer); provisions += num(l.provisions || 0); });
  frais.forEach(function (f) { totalFrais += num(f.montant); });
  const net = Math.round((loyers + provisions - totalFrais) * 100) / 100;
  if (req.net !== undefined && req.net !== '' && Math.abs(num(req.net) - net) > 0.02) {
    throw new Error('Le net viré (' + num(req.net).toFixed(2) + ' €) ne correspond pas au calcul (' + net.toFixed(2) + ' €)');
  }
  const relId = 'R' + Utilities.getUuid().slice(0, 7);
  const texte = function (s, max) { return String(s || '').replace(/^[=+\-@]/, "'$&").slice(0, max); };
  const pdfUrl = enregistrerPdf_(req.pdf, 'Relevé ' + LOGEMENTS[id].libelle + ' ' + req.date);
  const ddmmyyyy = req.date.slice(8, 10) + '/' + req.date.slice(5, 7) + '/' + req.date.slice(0, 4);

  // Relevé
  const sh = feuilleReleves_();
  const ligneReleve = [relId, id, req.date, lignes.map(function (l) { return l.periode; }).join(', '),
    loyers.toFixed(2), provisions.toFixed(2), totalFrais.toFixed(2), net.toFixed(2), pdfUrl, texte(req.remarque, 300)];
  sh.getRange(sh.getLastRow() + 1, 1, 1, ligneReleve.length).setNumberFormat('@').setValues([ligneReleve]);

  // Loyers encaissés (un paiement par période)
  lignes.forEach(function (l) {
    const brut = num(l.loyer) + num(l.provisions || 0);
    majPaiement_(id, l.periode, {
      montant: brut.toFixed(2), date_reception: req.date, valide_le: horodatage_(), quittance_le: 'agence',
      pdf: pdfUrl, remarque: texte((l.detail ? l.detail + ' · ' : '') + 'Relevé agence du ' + ddmmyyyy + ' [' + relId + ']', 300),
      charges: num(l.provisions || 0).toFixed(2)
    });
  });

  // Frais déduits -> dépenses
  const sd = feuilleDepenses_();
  const lignesDep = frais.map(function (f, i) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') ? f.date : req.date;
    const cat = CATEGORIES_FRAIS.indexOf(f.categorie) >= 0 ? f.categorie : 'Autre';
    return [relId + '-' + (i + 1), d, id, cat, texte(f.libelle || cat, 200), num(f.montant).toFixed(2), 'Relevé agence du ' + ddmmyyyy];
  });
  if (lignesDep.length) sd.getRange(sd.getLastRow() + 1, 1, lignesDep.length, 7).setNumberFormat('@').setValues(lignesDep);
  return relId;
}

function joindrePdfReleve_(relId, pdf) {
  const r = lireReleves_().filter(function (x) { return x.id === relId; })[0];
  if (!r) throw new Error('Relevé introuvable');
  const url = enregistrerPdf_(pdf, 'Relevé ' + LOGEMENTS[r.logement].libelle + ' ' + r.date);
  if (!url) throw new Error('Aucun PDF reçu');
  feuilleReleves_().getRange(r.ligne, COLS_RELEVE.indexOf('pdf') + 1).setValue(url);
  lirePaiements_().forEach(function (p) {
    if (p.remarque.indexOf('[' + relId + ']') >= 0) majPaiement_(p.logement, p.periode, { pdf: url });
  });
}

function supprimerReleve_(relId) {
  const r = lireReleves_().filter(function (x) { return x.id === relId; })[0];
  if (!r) throw new Error('Relevé introuvable');
  // dépenses liées
  const sd = getSS_().getSheetByName('Dépenses');
  if (sd && sd.getLastRow() >= 2) {
    const ids = sd.getRange(2, 1, sd.getLastRow() - 1, 1).getDisplayValues();
    for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0].indexOf(relId + '-') === 0) sd.deleteRow(i + 2);
  }
  // paiements liés
  const sp = feuillePaiements_();
  lirePaiements_().map(function (p) { return p; }).reverse().forEach(function (p) {
    if (p.remarque.indexOf('[' + relId + ']') >= 0) sp.deleteRow(p.ligne);
  });
  feuilleReleves_().deleteRow(r.ligne);
}

// Relevés existants du logement qui couvrent l'une des périodes données
function relevesCouvrant_(id, periodes) {
  return lireReleves_().filter(function (r) {
    return r.logement === id && String(r.periodes).split(', ').some(function (p) { return periodes.indexOf(p) >= 0; });
  });
}

// Texte d'un PDF : conversion temporaire en Google Doc (Drive), export texte, puis suppression
function texteDuPdf_(blob) {
  const jeton = ScriptApp.getOAuthToken();
  const frontiere = 'xxRELEVExx' + Date.now();
  const meta = JSON.stringify({ name: 'releve-temp-' + Date.now(), mimeType: 'application/vnd.google-apps.document' });
  const corps = Utilities.newBlob(
    '--' + frontiere + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
    '\r\n--' + frontiere + '\r\nContent-Type: application/pdf\r\n\r\n').getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + frontiere + '--').getBytes());
  const rep = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=fr', {
    method: 'post', contentType: 'multipart/related; boundary=' + frontiere, payload: corps,
    headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true
  });
  if (rep.getResponseCode() !== 200) throw new Error('conversion du PDF impossible (HTTP ' + rep.getResponseCode() + ')');
  const idDoc = JSON.parse(rep.getContentText()).id;
  try {
    const ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + idDoc + '/export?mimeType=text/plain', {
      headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true
    });
    if (ex.getResponseCode() !== 200) throw new Error('lecture du PDF impossible (HTTP ' + ex.getResponseCode() + ')');
    return ex.getContentText('UTF-8');
  } finally {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + idDoc, {
      method: 'delete', headers: { Authorization: 'Bearer ' + jeton }, muteHttpExceptions: true
    });
  }
}

// Cherche dans Gmail les comptes rendus de gestion de l'agence et les enregistre.
// Un email n'est traité qu'une fois. Si le relevé existe déjà avec le même net : on joint seulement le PDF.
// S'il existe avec un autre net : il est remplacé par les chiffres du PDF (qui fait foi).
function importerRelevesEmail_() {
  const P = lireParams_();
  const id = Object.keys(LOGEMENTS).filter(function (k) { return estAgence_(P, k); })[0];
  if (!id) return 'aucun logement géré par une agence';
  const exp = String(P.releve_expediteur || '').trim();
  if (!exp) return 'expéditeur non renseigné';
  const tz = Session.getScriptTimeZone();
  const traites = String(P.releves_mails_traites || '').split('|').filter(String);
  const fils = GmailApp.search('from:(' + exp + ') has:attachment filename:pdf newer_than:60d', 0, 20);
  const bilan = [];
  fils.forEach(function (fil) {
    fil.getMessages().forEach(function (msg) {
      const mid = msg.getId();
      if (traites.indexOf(mid) >= 0) return;
      if (String(msg.getFrom()).toLowerCase().indexOf(exp.toLowerCase()) < 0) return;
      const pdfs = msg.getAttachments().filter(function (a) {
        return /pdf/i.test(a.getContentType()) || /\.pdf$/i.test(a.getName());
      });
      pdfs.forEach(function (pj) {
        const recuLe = Utilities.formatDate(msg.getDate(), tz, 'dd/MM/yyyy');
        const texte = texteDuPdf_(pj.copyBlob()); // en cas d'échec technique : l'email sera retenté à la prochaine heure
        if (!/compte rendu de gestion/i.test(texte)) return; // autre pièce jointe (facture, avis…)
        let r;
        try {
          r = lireCompteRendu_(texte);
        } catch (err) {
          bilan.push('échec : ' + pj.getName() + ' — ' + err.message);
          ecrireParam_('releve_derniere_lecture', recuLe + ' — ' + pj.getName() + ' : ' + err.message);
          notifier_(P, 'Relevé d\'agence à saisir', 'Relevé reçu, mais pas lu automatiquement',
            ['L\'email de l\'agence du ' + recuLe + ' contient un relevé que je n\'ai pas réussi à lire. Saisis-le dans l\'application : « Paiements » › ' + LOGEMENTS[id].libelle + ' › « Ajouter un relevé ».'],
            [['Fichier', pj.getName()], ['Raison', err.message]], 'Ouvrir Paiements', 'paiements', '');
          return;
        }
        const pdf = { nom: pj.getName(), base64: Utilities.base64Encode(pj.getBytes()) };
        const existants = relevesCouvrant_(id, r.lignes.map(function (l) { return l.periode; }));
        const memeNet = existants.length === 1 && Math.abs(existants[0].net - Number(r.net)) < 0.01;
        const mois = r.lignes.map(function (l) { const mp = moisDePeriode_(l.periode); return mp.mois + ' ' + mp.annee; }).join(' + ');
        const lignesMail = [['Période', mois], ['Loyers et charges encaissés', euroTxt_(r.loyers)]]
          .concat(r.frais.map(function (f) { return [f.libelle, (Number(f.montant) < 0 ? '+ ' : '− ') + euroTxt_(Math.abs(Number(f.montant)))]; }))
          .concat([['Net viré', euroTxt_(r.net)]]);
        if (memeNet) {
          if (!existants[0].pdf) joindrePdfReleve_(existants[0].id, pdf);
          bilan.push('déjà enregistré : ' + mois);
        } else {
          existants.forEach(function (x) { supprimerReleve_(x.id); });
          ajouterReleve_({ logement: id, date: r.date, lignes: r.lignes, frais: r.frais, net: r.net, pdf: pdf,
            remarque: 'Importé automatiquement de l\'email du ' + recuLe });
          bilan.push((existants.length ? 'corrigé : ' : 'importé : ') + mois);
          notifier_(P, 'Relevé ' + mois + ' ' + (existants.length ? 'corrigé' : 'enregistré') + ' : ' + euroTxt_(r.net) + ' net',
            existants.length ? 'Relevé d\'agence corrigé automatiquement' : 'Relevé d\'agence enregistré automatiquement',
            [existants.length
              ? 'Le relevé de ' + mois + ' déjà saisi ne correspondait pas au compte rendu reçu le ' + recuLe + ' (net ' + euroTxt_(existants[0].net) + '). Il a été remplacé par les chiffres du PDF.'
              : 'Le compte rendu de gestion reçu le ' + recuLe + ' a été lu et enregistré, et le PDF archivé dans Drive. Tu n\'as rien à faire.'],
            lignesMail, 'Voir dans l\'application', 'paiements', 'Les frais sont enregistrés comme dépenses dans le Bilan.');
        }
        ecrireParam_('releve_derniere_lecture', recuLe + ' — ' + bilan[bilan.length - 1]);
      });
      traites.push(mid);
      ecrireParam_('releves_mails_traites', traites.slice(-40).join('|'));
    });
  });
  return bilan.length ? bilan.join(' | ') : 'aucun nouveau relevé';
}

// ---------- Lecture automatique des comptes rendus de gestion (agence) ----------
// Le PDF est converti en texte par Google Drive ; chaque cellule de tableau commence par une tabulation.
const RE_MONTANT_ = /^-?\d{1,3}(?:[   ]\d{3})*,\d{2}$/;
function montantFr_(s) { return Math.round(Number(String(s).replace(/[   ]/g, '').replace(',', '.')) * 100) / 100; }
function rond_(n) { return Math.round(n * 100) / 100; }

function lireCompteRendu_(texte) {
  const lignes = String(texte).replace(/\r/g, '').split('\n').map(function (l) {
    return { cellule: /^\t/.test(l), t: l.replace(/\s+$/, '').replace(/^\t+/, '').trim() };
  });
  const idx = function (re, depuis) { for (let i = depuis || 0; i < lignes.length; i++) if (re.test(lignes[i].t)) return i; return -1; };
  const estMontant = function (l) { return RE_MONTANT_.test(l.t); };
  const estDate = function (l) { return /^\d{2}\/\d{2}\/\d{4}$/.test(l.t); };
  // Blocs de montants consécutifs (une cellule = un bloc)
  const blocs = function (de, a) {
    const out = []; let cur = null;
    for (let i = de; i < a; i++) {
      const l = lignes[i];
      if (estMontant(l)) {
        if (l.cellule || !cur) { cur = []; out.push(cur); }
        cur.push(montantFr_(l.t));
      } else if (l.t) cur = null;
    }
    return out;
  };
  const err = function (m) { throw new Error('Relevé illisible : ' + m); };

  // Date d'arrêté
  const iArr = idx(/Arr[êe]t[ée] au \d{2}\/\d{2}\/\d{4}/i);
  if (iArr < 0) err('date « Arrêté au » introuvable');
  const md = lignes[iArr].t.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const date = md[3] + '-' + md[2] + '-' + md[1];

  // Loyers et provisions (tableau « Situation et libellés »)
  const iSit = idx(/^SITUATION ET LIBELL/i);
  const iRecap = idx(/^RECAPITULATIF\s*$/i, iSit);
  if (iSit < 0 || iRecap < 0) err('tableau des loyers introuvable');
  const postes = [];
  for (let i = iSit; i < iRecap; i++) if (/\bdu \d{2}\/\d{2}\/\d{4}/i.test(lignes[i].t)) postes.push(lignes[i].t);
  if (!postes.length) err('aucun loyer trouvé');
  const mSit = [].concat.apply([], blocs(iSit, iRecap));
  const n = postes.length;
  if (mSit.length < 2 * n) err('montants des loyers incomplets');
  const regles = mSit.slice(n, 2 * n);
  const periodes = {}; const ordre = []; let courant = null; const enAttente = [];
  postes.forEach(function (p, k) {
    const d = p.match(/du (\d{2})\/(\d{2})\/(\d{4})/);
    if (/^Loyer/i.test(p)) {
      courant = d[3] + '-' + d[2];
      if (!periodes[courant]) { periodes[courant] = { periode: courant, loyer: 0, provisions: 0, detail: [] }; ordre.push(courant); }
      periodes[courant].loyer = rond_(periodes[courant].loyer + regles[k]);
      enAttente.splice(0).forEach(function (x) { periodes[courant].provisions = rond_(periodes[courant].provisions + x.m); if (x.d) periodes[courant].detail.push(x.d); });
    } else {
      const lib = /r[ée]gularisation/i.test(p) ? 'Régularisation ' + euroCourt_(regles[k]) : '';
      if (courant) { periodes[courant].provisions = rond_(periodes[courant].provisions + regles[k]); if (lib) periodes[courant].detail.push(lib); }
      else enAttente.push({ m: regles[k], d: lib });
    }
  });
  if (!ordre.length) err('aucune ligne « Loyer du … » trouvée');
  if (enAttente.length) err('provision sans loyer associé');
  const totalLoyers = rond_(ordre.reduce(function (s, p) { return s + periodes[p].loyer + periodes[p].provisions; }, 0));

  // Opérations : frais déduits et avoirs
  const iOp = idx(/^TOTAL DES R[ÈE]GLEMENTS/i, iRecap);
  const iTot = idx(/^Totaux G[ée]n[ée]raux/i, iOp);
  const iSolde = idx(/^Solde cr[ée]diteur en Euros/i, iTot);
  if (iOp < 0 || iTot < 0 || iSolde < 0) err('récapitulatif des opérations introuvable');
  const libelles = [];
  for (let i = iOp + 1; i < iTot; i++) {
    const l = lignes[i];
    if (!l.t || estMontant(l) || estDate(l)) continue;
    if (/^(D[ée]penses ou Travaux d[ée]ductibles|Divers|Honoraires de gestion|Travaux|D[ée]penses|Recettes)$/i.test(l.t)) continue;
    libelles.push(l.t);
  }
  const bOp = blocs(iOp, iTot);
  const bTot = blocs(iTot, iSolde);
  const bSolde = blocs(iSolde, Math.min(lignes.length, iSolde + 6));
  if (bTot.length < 2 || !bSolde.length) err('totaux généraux illisibles');
  const totDebits = bTot[0][0], totCredits = bTot[1][0], net = bSolde[0][0];
  let debits = [], credits = [];
  bOp.forEach(function (b) {
    if (b[0] === totalLoyers && !credits.length) credits = b.slice(1); else if (!debits.length) debits = b; else credits = credits.concat(b);
  });
  const somme = function (a) { return rond_(a.reduce(function (s, x) { return s + x; }, 0)); };
  if (somme(debits) !== totDebits) err('total des débits incohérent');
  if (rond_(totalLoyers + somme(credits)) !== totCredits) err('total des crédits incohérent');
  if (rond_(totCredits - totDebits) !== net) err('solde incohérent');

  const avoirs = libelles.filter(function (l) { return /avoir|rembours/i.test(l); });
  const charges = libelles.filter(function (l) { return !/avoir|rembours/i.test(l); });
  if (charges.length !== debits.length || avoirs.length !== credits.length) err('libellés et montants des frais ne correspondent pas');

  const frais = []; let gestion = 0;
  charges.forEach(function (l, k) {
    const m = debits[k];
    if (/Honoraires H\.?T|^TVA/i.test(l)) gestion = rond_(gestion + m);
    else if (/garantie|impay|GLI/i.test(l)) frais.push({ categorie: 'Assurance loyers impayés (GLI)', libelle: 'Cotisation garantie des loyers impayés', montant: m.toFixed(2) });
    else frais.push({ categorie: /honoraire|hono\b/i.test(l) ? 'Honoraires d\'agence' : 'Autre', libelle: l.slice(0, 120), montant: m.toFixed(2) });
  });
  if (gestion) frais.push({ categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion', montant: gestion.toFixed(2) });
  avoirs.forEach(function (l, k) {
    frais.push({ categorie: /hono/i.test(l) ? 'Honoraires d\'agence' : 'Autre', libelle: l.slice(0, 120), montant: (-credits[k]).toFixed(2) });
  });

  const lignesRel = ordre.map(function (p) {
    const x = periodes[p];
    return { periode: p, loyer: x.loyer.toFixed(2), provisions: x.provisions.toFixed(2), detail: x.detail.join(', ') };
  });
  const totFrais = somme(frais.map(function (f) { return Number(f.montant); }));
  if (rond_(totalLoyers - totFrais) !== net) err('le calcul loyers − frais ne donne pas le net');
  return { date: date, lignes: lignesRel, frais: frais, net: net.toFixed(2), loyers: totalLoyers.toFixed(2), totalFrais: totFrais.toFixed(2) };
}

function euroCourt_(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

// ---------- Appli Comptes : total net des loyers par mois d'arrivée sur le compte ----------
const COMPTES_SS_ID = '1qFAGMnfFkznxkckuF5eGgY0XSo9qWAGao1vi_e5rkfw';
const COMPTES_FEUILLE = 'Fin_Archives';
const COMPTES_CATEGORIE = 'Loyers France';

// { 'aaaa-mm': total } — Maison gérée par l'agence : net viré de chaque relevé (mois du relevé) ;
// logements en direct : loyers validés (mois de réception), complétés par l'historique de l'onglet Principale.
function totauxLoyersParMois_() {
  const releves = lireReleves_();
  const debutAgence = {};
  releves.forEach(function (r) { const m = r.date.slice(0, 7); if (!debutAgence[r.logement] || m < debutAgence[r.logement]) debutAgence[r.logement] = m; });
  const parCle = {};
  lireHistorique_().forEach(function (h) {
    const m = h.date.slice(0, 7);
    ['maison', 'trianon'].forEach(function (id) {
      if (!(h[id] > 0)) return;
      if (debutAgence[id] && m >= debutAgence[id]) return;
      parCle[id + '|' + m] = { mois: m, montant: h[id] };
    });
  });
  lirePaiements_().forEach(function (p) {
    if (!p.valide_le || p.quittance_le === 'agence') return;
    const recu = /^\d{4}-\d{2}/.test(p.date_reception) ? p.date_reception.slice(0, 7) : p.periode;
    delete parCle[p.logement + '|' + p.periode]; // remplace l'entrée d'historique du même loyer
    parCle[p.logement + '|' + p.periode] = { mois: recu, montant: Number(String(p.montant).replace(',', '.')) || 0 };
  });
  const tot = {};
  Object.keys(parCle).forEach(function (k) { const e = parCle[k]; tot[e.mois] = rond_((tot[e.mois] || 0) + e.montant); });
  releves.forEach(function (r) { const m = r.date.slice(0, 7); tot[m] = rond_((tot[m] || 0) + r.net); });
  return tot;
}

function synchroniserComptes_() {
  const P = lireParams_();
  const depuis = String(P.comptes_depuis || '2026-08');
  const tz = Session.getScriptTimeZone();
  const courant = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const tot = totauxLoyersParMois_();
  const changes0 = [];
  const ssC = SpreadsheetApp.openById(COMPTES_SS_ID);
  const declLignes = lignesDeclaration_();
  try { if (publierDeclarationComptes_(ssC, declLignes)) changes0.push('déclaration'); } catch (err) { changes0.push('déclaration : ' + err.message); }
  if (bool_(P.impots_sync)) {
    try { synchroniserImpots_(ssC, declLignes, P).forEach(function (x) { changes0.push(x); }); } catch (err) { changes0.push('fichier impôts : ' + err.message); }
  }
  const sh = ssC.getSheetByName(COMPTES_FEUILLE);
  if (!sh) throw new Error('feuille « ' + COMPTES_FEUILLE + ' » introuvable dans le classeur Comptes');
  const n = sh.getLastRow();
  const valeurs = n >= 2 ? sh.getRange(2, 1, n - 1, 3).getValues() : [];
  const moisDe = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM');
    const m = String(v).trim().match(/^(\d{4})-(\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
  };
  const ligneDe = {};
  valeurs.forEach(function (r, i) { if (String(r[1]).trim() === COMPTES_CATEGORIE) ligneDe[moisDe(r[0])] = { ligne: i + 2, montant: Number(r[2]) || 0 }; });
  const changes = [];
  Object.keys(tot).sort().forEach(function (m) {
    if (m < depuis || m > courant || !(tot[m] > 0)) return;
    const ex = ligneDe[m];
    if (ex) {
      if (Math.abs(ex.montant - tot[m]) < 0.005) return;
      sh.getRange(ex.ligne, 3).setValue(tot[m]);
    } else {
      sh.appendRow([m, COMPTES_CATEGORIE, tot[m]]);
      sh.getRange(sh.getLastRow(), 1).setNumberFormat('@').setValue(m);
    }
    changes.push(m + ' : ' + euroTxt_(tot[m]));
  });
  changes0.forEach(function (x) { if (x !== 'déclaration') changes.push(x); });
  if (changes.length) {
    ecrireParam_('comptes_derniere_sync', Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm') + ' — ' + changes.join(', '));
  }
  return changes;
}

// ---------- Déclaration des revenus fonciers (2044), publiée aussi dans l'appli Comptes ----------
const LIGNES_2044 = [
  { n: '221', lib: 'Frais d\'administration et de gestion', cats: ['Honoraires d\'agence', 'Frais de gestion'] },
  { n: '222', lib: 'Autres frais de gestion (forfait 20 € par logement)', forfait: true },
  { n: '223', lib: 'Primes d\'assurance', cats: ['Assurance loyers impayés (GLI)', 'Assurance propriétaire (PNO)'] },
  { n: '224', lib: 'Travaux de réparation, d\'entretien et d\'amélioration', cats: ['Travaux & entretien'] },
  { n: '227', lib: 'Taxe foncière (hors taxe d\'ordures ménagères)', cats: ['Taxe foncière'] },
  { n: '229', lib: 'Provisions pour charges de copropriété', cats: ['Charges de copropriété'] },
  { n: '250', lib: 'Intérêts d\'emprunt', cats: ['Intérêts d\'emprunt'] }
];

// Encaissements (même logique que l'application) : historique de Principale, remplacé par les paiements validés
function encaissementsServeur_() {
  const m = {};
  lireHistorique_().forEach(function (h) {
    const per = h.date.slice(0, 7);
    Object.keys(LOGEMENTS).forEach(function (id) {
      if (h[id] > 0) m[id + '|' + per] = { logement: id, periode: per, montant: h[id], date_reception: '', charges: null };
    });
  });
  lirePaiements_().forEach(function (p) {
    if (!p.valide_le) return;
    m[p.logement + '|' + p.periode] = { logement: p.logement, periode: p.periode,
      montant: Number(String(p.montant).replace(',', '.')) || 0, date_reception: p.date_reception,
      charges: p.charges !== '' && p.charges !== undefined ? Number(String(p.charges).replace(',', '.')) || 0 : null };
  });
  return Object.keys(m).map(function (k) { return m[k]; });
}

// Lignes à écrire : [Année, Mois (vide = annuel), Clé, Libellé, <un montant par logement>, Total]
function lignesDeclaration_() {
  const logs = Object.keys(LOGEMENTS);
  const chargesActuelles = {};
  logs.forEach(function (id) { chargesActuelles[id] = locataire_(id).charges; });
  const enc = encaissementsServeur_();
  const dep = lireDepenses_();
  const annees = {};
  enc.forEach(function (e) { annees[(/^\d{4}/.test(e.date_reception) ? e.date_reception : e.periode).slice(0, 4)] = 1; });
  dep.forEach(function (d) { annees[d.date.slice(0, 4)] = 1; });
  const out = [];
  Object.keys(annees).sort().forEach(function (a) {
    const zero = function () { const o = {}; logs.forEach(function (id) { o[id] = 0; }); return o; };
    const loyers = zero(), charges = zero(), recu = zero(), totFrais = zero();
    const mois = []; for (let i = 0; i < 12; i++) mois.push({ brut: zero(), charges: zero(), frais: zero() });
    let estime = 0;
    enc.forEach(function (e) {
      const m = /^\d{4}-\d{2}/.test(e.date_reception) ? e.date_reception.slice(0, 7) : e.periode;
      if (m.slice(0, 4) !== a) return;
      let ch = e.charges;
      if (ch === null) { ch = chargesActuelles[e.logement] || 0; estime = 1; }
      ch = Math.min(ch, e.montant);
      loyers[e.logement] += e.montant - ch; charges[e.logement] += ch; recu[e.logement] = 1;
      const mo = mois[Number(m.slice(5, 7)) - 1];
      mo.brut[e.logement] += e.montant - ch; mo.charges[e.logement] += ch;
    });
    const depA = dep.filter(function (d) { return d.date.slice(0, 4) === a; });
    const lignes = LIGNES_2044.map(function (L) {
      const v = zero();
      if (L.forfait) { logs.forEach(function (id) { if (recu[id]) { v[id] = 20; mois[11].frais[id] += 20; } }); }
      else depA.filter(function (d) { return L.cats.indexOf(d.categorie) >= 0; }).forEach(function (d) {
        const mo = mois[Number(d.date.slice(5, 7)) - 1];
        if (d.logement === 'commun') logs.forEach(function (id) { v[id] += d.montant / logs.length; mo.frais[id] += d.montant / logs.length; });
        else if (d.logement in v) { v[d.logement] += d.montant; mo.frais[d.logement] += d.montant; }
      });
      logs.forEach(function (id) { totFrais[id] += v[id]; });
      return { n: L.n, lib: L.lib, v: v };
    });
    const ligne = function (mo, cle, lib, o) {
      const vals = logs.map(function (id) { return rond_(o[id]); });
      out.push([a, mo, cle, lib].concat(vals, [rond_(vals.reduce(function (t, x) { return t + x; }, 0))]));
    };
    ligne('', '211', 'Loyers bruts encaissés', loyers);
    lignes.forEach(function (L) { ligne('', L.n, L.lib, L.v); });
    ligne('', '240', 'Total des frais et charges', totFrais);
    const res = zero(); logs.forEach(function (id) { res[id] = loyers[id] - totFrais[id]; });
    ligne('', 'resultat', 'Résultat foncier', res);
    ligne('', 'charges', 'Charges récupérées (non déclarées)', charges);
    if (estime) ligne('', 'estime', 'Charges estimées pour certains mois (historique)', zero());
    mois.forEach(function (mo, i) {
      const n = ('0' + (i + 1)).slice(-2);
      ligne(n, 'loyers', 'Loyers hors charges', mo.brut);
      ligne(n, 'charges', 'Charges récupérées', mo.charges);
      ligne(n, 'frais', 'Frais déductibles', mo.frais);
    });
  });
  return out;
}

function publierDeclarationComptes_(ss, declLignes) {
  const logs = Object.keys(LOGEMENTS);
  const entete = ['Annee', 'Mois', 'Cle', 'Libelle'].concat(logs.map(function (id) { return LOGEMENTS[id].libelle; }), ['Total']);
  const lignes = [entete].concat(declLignes || lignesDeclaration_());
  let sh = ss.getSheetByName('Fin_Declaration');
  if (!sh) { sh = ss.insertSheet('Fin_Declaration'); sh.hideSheet(); }
  const n = sh.getLastRow(), c = sh.getLastColumn();
  const avant = n && c ? JSON.stringify(sh.getRange(1, 1, n, c).getDisplayValues()) : '';
  const texte = lignes.map(function (r) { return r.map(function (x) { return typeof x === 'number' ? x.toFixed(2) : String(x); }); });
  if (avant === JSON.stringify(texte)) return false;
  sh.clearContents();
  sh.getRange(1, 1, texte.length, entete.length).setNumberFormat('@').setValues(texte);
  return true;
}

// ---------- Fichier « DÉCLARATIONS IMPÔTS FRANCE & ESPAGNE » (onglets « Revenus AAAA ») ----------
const IMPOTS_SS_ID = '1jThZTb0tiJE__FGkaNk9M_Qflk4QBk3tpwCq7f7z5gg';

// Repère la structure d'un onglet « Revenus AAAA » : ligne de janvier, colonnes de revenus (France / hors France), revenus du conjoint
// v : valeurs (nombres), d : valeurs affichées (les mois peuvent être des dates affichées « janvier »)
function structureRevenus_(v, d) {
  d = d || v;
  const txt = function (r, c) { return r >= 0 && r < d.length && c < d[r].length ? String(d[r][c]).trim() : ''; };
  let lj = -1;
  for (let r = 0; r < v.length && lj < 0; r++) for (let c = 0; c < v[r].length; c++) if (/^janv(ier|\.)?(\s|$)/i.test(txt(r, c))) { lj = r; break; }
  if (lj < 2) throw new Error('ligne « janvier » introuvable');
  const nbCol = Math.max.apply(null, v.map(function (r) { return r.length; }));
  // Colonnes de synthèse : à partir de la première cellule « SYNTHÈSE » ou « VOIR »
  let fin = nbCol;
  for (let r = 0; r < lj; r++) for (let c = 0; c < nbCol; c++) if (/synth[èe]se|voir/i.test(txt(r, c))) fin = Math.min(fin, c);
  // Groupe (France / hors France) : en-tête au-dessus, recopié vers la droite (cellules fusionnées)
  const groupe = []; let g = '';
  for (let c = 0; c < fin; c++) {
    for (let r = 0; r < lj - 1; r++) {
      const t = txt(r, c).replace(/^[^A-Za-zÀ-ÿ]+/, '');
      if (/^REVENUS\s+HORS/i.test(t)) g = 'hors'; else if (/^REVENUS\s+FRAN[ÇC]AIS/i.test(t)) g = 'france';
    }
    groupe.push(g);
  }
  // Libellé : ligne juste au-dessus de janvier, sinon la précédente (fusion)
  const cols = [];
  const estMoisCol = function (c) { return /^janv(ier|\.)?(\s|$)/i.test(txt(lj, c)); };
  for (let c = 0; c < fin; c++) {
    if (estMoisCol(c) || !groupe[c]) continue;
    let nom = '', src = -1;
    for (let k = c; k >= 0 && !nom; k--) {
      nom = txt(lj - 1, k) || txt(lj - 2, k); src = k;
      if (estMoisCol(k)) break;
    }
    const aDesDonnees = v.slice(lj, lj + 12).some(function (r) { return typeof r[c] === 'number'; });
    if (!nom || !(aDesDonnees || src === c || (src === c - 1 && estMoisCol(src)))) continue;
    if (/pas à déclarer|remb(\.|oursement)?\s*hacienda/i.test(nom)) continue;
    cols.push({ col: c, nom: nom, groupe: groupe[c], loyersFrance: /loyers?\s*france/i.test(nom) });
  }
  let conjoint = null, conjointNom = '';
  for (let r = 0; r < v.length; r++) for (let c = fin; c < nbCol; c++) {
    const m = txt(r, c).match(/^REVENUS\s+(?!FRAN|HORS)(.+?)\s*:?$/i);
    if (m && conjoint === null) {
      for (let k = c + 1; k < nbCol; k++) if (typeof v[r][k] === 'number') { conjoint = v[r][k]; conjointNom = m[1].trim(); break; }
    }
  }
  return { lj: lj, cols: cols, conjoint: conjoint, conjointNom: conjointNom };
}

// Écrit le résultat foncier mensuel dans « Loyers France » (années ≥ impots_depuis) et publie les revenus dans Comptes (Fin_Revenus)
function synchroniserImpots_(ssC, declLignes, P) {
  const tz = Session.getScriptTimeZone();
  const courant = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const depuis = String(P.impots_depuis || '2026');
  const resultat = {}; // 'aaaa-mm' -> loyers HC − frais
  declLignes.forEach(function (r) {
    if (!r[1]) return;
    const k = r[0] + '-' + r[1];
    const tot = Number(r[r.length - 1]) || 0;
    if (r[2] === 'loyers') resultat[k] = (resultat[k] || 0) + tot;
    if (r[2] === 'frais') resultat[k] = (resultat[k] || 0) - tot;
  });
  const ssI = SpreadsheetApp.openById(IMPOTS_SS_ID);
  const sortie = [['Annee', 'Groupe', 'Nom', 'Mois', 'Montant']];
  const journal = [];
  ssI.getSheets().forEach(function (sh) {
    const m = sh.getName().trim().match(/^Revenus\s+(\d{4})$/i);
    if (!m) return;
    const a = m[1];
    const rg = sh.getDataRange();
    const v = rg.getValues(), dv = rg.getDisplayValues();
    let st;
    try { st = structureRevenus_(v, dv); } catch (err) { journal.push(sh.getName() + ' : ' + err.message); return; }
    st.cols.forEach(function (c) {
      if (c.loyersFrance && a >= depuis) {
        let modif = 0;
        for (let i = 0; i < 12; i++) {
          const k = a + '-' + ('0' + (i + 1)).slice(-2);
          if (k > courant) break;
          const val = rond_(resultat[k] || 0);
          const cell = v[st.lj + i][c.col];
          if (typeof cell === 'number' && Math.abs(cell - val) < 0.005) continue;
          if (cell === '' && !val) continue;
          sh.getRange(st.lj + i + 1, c.col + 1).setValue(val);
          v[st.lj + i][c.col] = val; modif++;
        }
        const tete = sh.getRange(st.lj + 1, c.col + 1); // cellule de janvier
        const note = 'Rempli automatiquement par Mes Locations : résultat foncier du mois (loyers encaissés hors charges − frais déductibles, déclaration 2044). Ne pas saisir à la main.';
        if (tete.getNote() !== note) tete.setNote(note);
        if (modif) journal.push('impôts ' + a + ' : ' + modif + ' mois');
      }
      for (let i = 0; i < 12; i++) {
        const x = v[st.lj + i][c.col];
        if (typeof x === 'number' && x) sortie.push([a, c.groupe, c.loyersFrance ? 'Revenus fonciers (résultat 2044)' : c.nom, ('0' + (i + 1)).slice(-2), rond_(x)]);
      }
    });
    if (typeof st.conjoint === 'number') sortie.push([a, 'conjoint', 'Revenus ' + st.conjointNom, '', rond_(st.conjoint)]);
  });
  // Publication dans Comptes
  let fr = ssC.getSheetByName('Fin_Revenus');
  if (!fr) { fr = ssC.insertSheet('Fin_Revenus'); fr.hideSheet(); }
  const texte = sortie.map(function (r) { return r.map(function (x) { return typeof x === 'number' ? x.toFixed(2) : String(x); }); });
  const n = fr.getLastRow(), nc = fr.getLastColumn();
  const avant = n && nc ? JSON.stringify(fr.getRange(1, 1, n, nc).getDisplayValues()) : '';
  if (avant !== JSON.stringify(texte)) {
    fr.clearContents();
    fr.getRange(1, 1, texte.length, 5).setNumberFormat('@').setValues(texte);
  }
  return journal;
}

/**
 * À exécuter une fois depuis l'éditeur. Pour chaque onglet « Revenus AAAA » du fichier impôts qui a une colonne « Remb. Hacienda » :
 *  - recopie la colonne (mois, montants, total) à droite de la synthèse, sous le titre « PAS À DÉCLARER COMME REVENU » ;
 *  - vide la colonne dans le tableau des revenus ;
 *  - exclut cette colonne du « TOTAL À DÉCLARER » des revenus hors France (ex. =SUM(H19:L19) → =SUM(H19:K19)) ;
 *  - fait pointer « REVENUS HORS FRANCE : » de la synthèse vers ce total à déclarer (au lieu du seul total du lycée).
 * Les onglets sans colonne « Remb. Hacienda » (ex. 2025, déjà déclaré) ne sont pas touchés.
 */
function deplacerRemboursementsHacienda() {
  const ss = SpreadsheetApp.openById(IMPOTS_SS_ID);
  const bilan = [];
  const lettre = function (c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  ss.getSheets().forEach(function (sh) {
    if (!/^Revenus\s+\d{4}$/i.test(sh.getName().trim())) return;
    const rg = sh.getDataRange();
    const d = rg.getDisplayValues(), v = rg.getValues(), f = rg.getFormulas();
    const nbL = d.length, nbC = d[0].length;
    let lj = -1;
    for (let r = 0; r < nbL && lj < 0; r++) for (let c = 0; c < nbC; c++) if (/^janv(ier|\.)?(\s|$)/i.test(String(d[r][c]).trim())) { lj = r; break; }
    if (lj < 1) return;
    let col = -1;
    for (let c = 0; c < nbC; c++) if (/remb(\.|oursement)?\s*hacienda/i.test(String(d[lj - 1][c]))) col = c;
    if (col < 0) { bilan.push(sh.getName() + ' : pas de colonne « Remb. Hacienda », rien à faire'); return; }
    const L = lettre(col), K = lettre(col - 1);
    // Ligne TOTAL (somme de la colonne) et ligne TOTAL À DÉCLARER
    let rTot = -1, rDecl = -1;
    for (let r = lj + 12; r < nbL; r++) {
      if (rTot < 0 && /^=SUM\(/i.test(f[r][col])) rTot = r;
      for (let c = 0; c < nbC; c++) if (rDecl < 0 && /TOTAL\s+À\s+DÉCLARER/i.test(d[r][c]) && c > 0 && c <= col) rDecl = r;
    }
    // 1. Recopie à droite de la synthèse
    let dernier = 0;
    for (let r = 0; r < Math.min(nbL, lj + 16); r++) for (let c = 0; c < nbC; c++) if (String(d[r][c]).trim() !== '') dernier = Math.max(dernier, c);
    const dest = dernier + 4; // n° de colonne (1 = A) des montants : une colonne vide, les mois, puis les montants
    sh.getRange(lj - 1, dest - 1, 1, 2).merge().setValue('PAS À DÉCLARER COMME REVENU')
      .setFontWeight('bold').setFontColor('#C62828').setHorizontalAlignment('center').setWrap(true);
    sh.getRange(lj, dest).setValue('Remb. Hacienda (remboursement d\'impôt)').setFontWeight('bold').setWrap(true);
    sh.getRange(lj + 1, dest - 1, 12, 1).setValues(d.slice(lj, lj + 12).map(function (r) { return [r[0]]; })).setFontColor('#777777');
    sh.getRange(lj + 1, dest, 12, 1).setValues(v.slice(lj, lj + 12).map(function (r) { return [r[col]]; })).setNumberFormat('#,##0.00 €');
    const D = lettre(dest - 1);
    sh.getRange(lj + 13, dest - 1).setValue('TOTAL').setFontWeight('bold');
    sh.getRange(lj + 13, dest).setFormula('=SUM(' + D + (lj + 1) + ':' + D + (lj + 12) + ')').setNumberFormat('#,##0.00 €').setFontWeight('bold');
    sh.getRange(lj - 1, dest - 1).setNote('Remboursement d\'IRPF par Hacienda : ce n\'est pas un revenu, il ne se déclare pas. Colonne sortie du tableau des revenus par Mes Locations.');
    sh.setColumnWidth(dest, 170);
    // 2. Colonne vidée dans le tableau des revenus (en-tête et montants)
    sh.getRange(lj, col + 1).clearContent();
    sh.getRange(lj + 1, col + 1, 12, 1).clearContent();
    // 3. TOTAL À DÉCLARER sans cette colonne
    let totalHors = '';
    if (rDecl >= 0) {
      for (let c = 0; c < nbC; c++) {
        const fx = f[rDecl][c];
        if (fx && new RegExp(':' + L + (rTot + 1) + '\\)').test(fx)) {
          const nf = fx.replace(new RegExp(':' + L + (rTot + 1) + '\\)'), ':' + K + (rTot + 1) + ')');
          sh.getRange(rDecl + 1, c + 1).setFormula(nf);
          totalHors = lettre(c) + (rDecl + 1);
          bilan.push(sh.getName() + ' : ' + totalHors + ' ' + fx + ' → ' + nf);
        }
      }
    }
    // 4. Synthèse « REVENUS HORS FRANCE : » → total à déclarer
    if (totalHors) {
      for (let r = 0; r < Math.min(nbL, lj + 12); r++) for (let c = col + 1; c < nbC; c++) {
        if (!/REVENUS\s+HORS\s+FRANCE/i.test(d[r][c])) continue;
        for (let k = c + 1; k < nbC; k++) if (f[r][k]) {
          if (f[r][k] !== '=' + totalHors) {
            sh.getRange(r + 1, k + 1).setFormula('=' + totalHors);
            bilan.push(sh.getName() + ' : ' + lettre(k) + (r + 1) + ' ' + f[r][k] + ' → =' + totalHors);
          }
          break;
        }
      }
    }
    bilan.push(sh.getName() + ' : colonne « Remb. Hacienda » déplacée en ' + lettre(dest - 2) + '–' + lettre(dest - 1));
  });
  const msg = bilan.length ? bilan.join('\n') : 'Aucun onglet « Revenus AAAA » trouvé.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  try { synchroniserComptes_(); } catch (e) { /* mis à jour au prochain passage horaire */ }
}

/**
 * À exécuter une fois depuis l'éditeur : enregistre les travaux 2026 de séparation des deux logements
 * (factures PEM Gistain, Enedis, SAUR) dans l'onglet Dépenses, catégorie « Travaux & entretien » (ligne 224).
 * Sans doublon : une ligne déjà présente (même ID) n'est pas réécrite.
 */
function ajouterTravaux2026() {
  const T = [
    ['TRV26-01', '2026-02-03', 'trianon', 'PEM Gistain F-2026-0296 : acompte 30 % devis D-2025-0257 (accès et réseaux)', 5540.40],
    ['TRV26-02', '2026-03-01', 'trianon', 'PEM Gistain F-2026-0302 : création de l\'accès, passage réseaux eau/électricité/télécom', 6028.00],
    ['TRV26-03', '2026-03-25', 'trianon', 'Enedis 3261-0690960450 : raccordement électrique 5 bis', 1544.40],
    ['TRV26-04', '2026-04-03', 'trianon', 'PEM Gistain F-2026-0311 : accès (décapage, ballast, concassé) et buse', 7272.00],
    ['TRV26-05', '2026-04-03', 'commun', 'PEM Gistain F-2026-0311 : clôture de séparation 60 ml', 1752.00],
    ['TRV26-06', '2026-04-08', 'trianon', 'SAUR devis D595260016783 : branchement eau 5 bis', 2048.28],
    ['TRV26-07', '2026-04-24', 'trianon', 'PEM Gistain F-2026-0315 : remise aux normes électriques petite maison', 3000.00],
    ['TRV26-08', '2026-08-10', 'trianon', 'PEM Gistain F-2026-0332 : raccordements eau et électricité petite maison', 1752.00]
  ];
  const sh = feuilleDepenses_();
  const deja = lireDepenses_().map(function (d) { return d.id; });
  const aAjouter = T.filter(function (t) { return deja.indexOf(t[0]) < 0; })
    .map(function (t) { return [t[0], t[1], t[2], 'Travaux & entretien', t[3], t[4].toFixed(2), 'Séparation des logements (factures 2026)']; });
  if (aAjouter.length) sh.getRange(sh.getLastRow() + 1, 1, aAjouter.length, 7).setNumberFormat('@').setValues(aAjouter);
  const total = T.reduce(function (s, t) { return s + t[4]; }, 0);
  const msg = aAjouter.length + ' dépense(s) ajoutée(s) sur ' + T.length + ' · total des travaux : ' + euroTxt_(total);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
  try { synchroniserComptes_(); } catch (e) { /* prochain passage horaire */ }
}

/** À exécuter une fois depuis l'éditeur pour vérifier l'accès au classeur Comptes et tout mettre à jour. */
function testerComptes() {
  const ch = synchroniserComptes_();
  const tot = totauxLoyersParMois_();
  const lignes = Object.keys(tot).sort().filter(function (m) { return m >= String(lireParams_().comptes_depuis || '2026-08'); })
    .map(function (m) { return m + ' : ' + euroTxt_(tot[m]); });
  const msg = 'Totaux nets des loyers :\n' + lignes.join('\n') + '\n\n' + (ch.length ? 'Mis à jour :\n' + ch.join('\n') : 'Comptes et le fichier impôts étaient déjà à jour.');
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

// Locataire actuel (Maison et Trianon), calculé par le script à partir du tableau des locataires de l'onglet Principale
// (colonnes A nom, B prénom, C civilité, D début, E fin) et écrit en valeurs dans K/L/M.
// Retenu : début passé et fin vide ou à venir ; le plus bas dans la liste s'il y en a plusieurs.
// Mis à jour automatiquement à chaque passage horaire : plus besoin de formules.
const TABLES_LOCATAIRES = [
  { libelle: 'Maison', premiere: 6, derniere: 18, civilite: 'K6', prenom: 'L6', nom: 'M6' },
  { libelle: 'Trianon', premiere: 22, derniere: 33, civilite: 'K21', prenom: 'L21', nom: 'M21' }
];

function majLocataires_() {
  const p = principale_();
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  const finJour = new Date(auj.getTime() + 86400000 - 1);
  return TABLES_LOCATAIRES.map(function (t) {
    const lignes = p.getRange(t.premiere, 1, t.derniere - t.premiere + 1, 5).getValues();
    let choisi = null;
    lignes.forEach(function (r) {
      const debut = r[3] instanceof Date ? r[3] : null;
      const fin = r[4] instanceof Date ? r[4] : null;
      if (String(r[0]).trim() && debut && debut <= finJour && (!fin || fin >= auj)) choisi = r;
    });
    if (!choisi) return t.libelle + ' : aucun locataire en cours (vérifie les dates)';
    const valeurs = [[String(choisi[2]).trim(), String(choisi[1]).trim(), String(choisi[0]).trim()]];
    [[t.civilite, 0], [t.prenom, 1], [t.nom, 2]].forEach(function (x) {
      const cel = p.getRange(x[0]);
      if (cel.getFormula() || cel.getDisplayValue() !== valeurs[0][x[1]]) cel.setValue(valeurs[0][x[1]]);
    });
    return t.libelle + ' : ' + valeurs[0].join(' ');
  });
}

// À exécuter une fois depuis l'éditeur (ensuite, la tâche horaire s'en charge)
function corrigerLocataireMaison() {
  const res = majLocataires_();
  SpreadsheetApp.flush();
  const msg = 'Locataires actuels\n' + res.join('\n') +
    '\n\nRègle : date de début (col. D) passée et date de fin (col. E) vide ou à venir ; le plus bas dans la liste s\'il y en a plusieurs. Mise à jour automatique toutes les heures.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* éditeur */ }
}

// À exécuter depuis l'éditeur si l'appli affiche « The script does not have permission… (gmail) ».
// Google accorde désormais les autorisations fonction par fonction : celle-ci demande TOUTES les autorisations
// du script (cocher toutes les cases, dont Gmail), puis t'envoie un email de test.
function autoriser() {
  try { ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); } catch (e) { /* ancienne version d'Apps Script */ }
  const moi = Session.getEffectiveUser().getEmail();
  GmailApp.sendEmail(moi, '[Mes Locations] Autorisation Gmail OK',
    'Le script peut envoyer des emails depuis ' + moi + '. Tu peux réessayer « Recevoir un exemple de notification » dans l\'application.',
    { name: 'Mes Locations' });
  DriveApp.getFolderById(DOSSIER_QUITTANCES).getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  const msg = 'Autorisations accordées pour ' + moi + '. Un email de test vient d\'être envoyé.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* éditeur */ }
}

// À exécuter UNE FOIS depuis l'éditeur : passe la Maison en gestion par agence
// et importe les relevés d'août, septembre et octobre 2026 (sans les PDF, à joindre ensuite depuis l'appli).
function importerRelevesAgence2026() {
  ecrireParam_('maison.gestion', 'agence');
  if (!lireParams_()['maison.agence_nom']) ecrireParam_('maison.agence_nom', 'Agence (Villenave-d\'Ornon)');
  ecrireParam_('maison.quittance_active', 'FALSE');
  ecrireParam_('maison.assurance_active', 'FALSE');
  ecrireParam_('maison.rappel_impaye', 'FALSE');
  const gli = function (d) { return { date: d, categorie: 'Assurance loyers impayés (GLI)', libelle: 'Cotisation garantie des loyers impayés 2026', montant: 31.32 }; };
  const gestion = function (ht, tva) { return { categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion (HT ' + ht.toFixed(2) + ' + TVA ' + tva.toFixed(2) + ')', montant: Math.round((ht + tva) * 100) / 100 }; };
  const releves = [
    { logement: 'maison', date: '2026-08-20', net: 1236.70, remarque: 'Locataire TRIVERIO Dominique — entrée le 17/07/2026',
      lignes: [{ periode: '2026-07', loyer: 556.45, provisions: 4.84, detail: 'Loyer du 17/07 au 31/07/2026' },
               { periode: '2026-08', loyer: 1150, provisions: 10 }],
      frais: [gli('2026-08-19'),
              { date: '2026-07-27', categorie: 'Honoraires d\'agence', libelle: 'Mise en location : état des lieux 360 + visite/dossier/bail 790 − avoir 800', montant: 350 },
              gestion(86.06, 17.21)] },
    { logement: 'maison', date: '2026-09-21', net: 1059.08, remarque: 'Locataire TRIVERIO Dominique',
      lignes: [{ periode: '2026-09', loyer: 1150, provisions: 10 }], frais: [gli('2026-09-21'), gestion(58, 11.60)] },
    { logement: 'maison', date: '2026-10-20', net: 1059.08, remarque: 'Locataire TRIVERIO Dominique',
      lignes: [{ periode: '2026-10', loyer: 1150, provisions: 10 }], frais: [gli('2026-10-20'), gestion(58, 11.60)] }
  ];
  const deja = lireReleves_();
  let n = 0;
  releves.forEach(function (r) {
    if (deja.some(function (x) { return x.logement === r.logement && x.date === r.date; })) return;
    ajouterReleve_(r); n++;
  });
  const msg = n + ' relevé(s) importé(s). La Maison est maintenant en gestion par agence.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* éditeur */ }
}

// ---------- Paiements ----------
// ---------- Dépenses ----------
function feuilleDepenses_() {
  const ss = getSS_();
  let sh = ss.getSheetByName('Dépenses');
  if (!sh) {
    sh = ss.insertSheet('Dépenses');
    sh.getRange('A1:G1').setValues([['ID', 'Date', 'Logement', 'Catégorie', 'Libellé', 'Montant', 'Remarque']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:G').setNumberFormat('@');
  }
  return sh;
}

function lireDepenses_() {
  const sh = getSS_().getSheetByName('Dépenses');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 7).getDisplayValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: r[0], date: r[1], logement: r[2], categorie: r[3], libelle: r[4],
               montant: Number(String(r[5]).replace(',', '.')) || 0, remarque: r[6] };
    });
}

// Historique des loyers saisi dans l'onglet Principale (tableau à partir de la ligne 39)
function lireHistorique_() {
  const p = principale_();
  const n = p.getLastRow();
  if (n < 39) return [];
  const tz = Session.getScriptTimeZone();
  return p.getRange(39, 2, n - 38, 5).getValues()
    .filter(function (r) { return r[0] instanceof Date; })
    .map(function (r) {
      return { date: Utilities.formatDate(r[0], tz, 'yyyy-MM-dd'), maison: Number(r[2]) || 0, trianon: Number(r[4]) || 0 };
    });
}

const COLS_PAIEMENT = ['logement', 'periode', 'montant', 'date_reception', 'valide_le', 'quittance_le', 'pdf', 'remarque', 'charges'];

function lirePaiements_() {
  const sh = feuillePaiements_();
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, COLS_PAIEMENT.length).getDisplayValues().map(function (r, i) {
    const o = { ligne: i + 2 };
    COLS_PAIEMENT.forEach(function (c, j) { o[c] = r[j]; });
    return o;
  }).filter(function (p) { return p.logement; });
}

function trouverPaiement_(id, periode) {
  return lirePaiements_().filter(function (p) { return p.logement === id && p.periode === periode; })[0] || null;
}

function majPaiement_(id, periode, champs) {
  const sh = feuillePaiements_();
  const p = trouverPaiement_(id, periode);
  const ligne = p ? p.ligne : sh.getLastRow() + 1;
  const base = p || { logement: id, periode: periode };
  const valeurs = COLS_PAIEMENT.map(function (c) { return (c in champs) ? champs[c] : (base[c] || ''); });
  sh.getRange(ligne, 1, 1, valeurs.length).setNumberFormat('@').setValues([valeurs]);
}


/* ================================================================
 *  COMPATIBILITÉ : boutons, cases à cocher et anciens déclencheurs
 * ================================================================ */
// Anciens déclencheurs -> nouvelle logique (avec contrôle du paiement)
function verifierEnvoiEmailQuittances() { tacheAutomatique(); }
function verifierEnvoiEmailAssurances() { tacheAutomatique(); }
function executeAssuranceFunctions() { tacheAutomatique(); }

// Envoi manuel depuis le tableur = validation du paiement par toi
function envoiManuelQuittance_(id, confirmer) {
  const L = LOGEMENTS[id];
  const loc = locataire_(id);
  if (confirmer && !confirmer_('Valider le paiement du mois et envoyer la quittance de ' + loc.prenom + ' ' + loc.nom + ' (' + L.libelle + ') ?')) return;
  const tz = Session.getScriptTimeZone();
  const periode = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const p = trouverPaiement_(id, periode);
  if (!p || !p.valide_le) {
    majPaiement_(id, periode, {
      montant: String(loc.loyer), date_reception: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
      valide_le: horodatage_(), remarque: 'validé depuis le tableur'
    });
  }
  envoyerQuittance_(id, periode);
}

function archmaison()   { envoiManuelQuittance_('maison', true); }
function archtrianon()  { envoiManuelQuittance_('trianon', true); }
function archmaison2()  { envoiManuelQuittance_('maison', false); }
function archtrianon2() { envoiManuelQuittance_('trianon', false); }

function assurancemaison()   { if (confirmer_('Envoyer la demande d\'attestation (Maison) ?')) envoyerAssurance_('maison', false); }
function assurancetrianon()  { if (confirmer_('Envoyer la demande d\'attestation (Trianon) ?')) envoyerAssurance_('trianon', false); }
function assurancemaison2()  { envoyerAssurance_('maison', false); }
function assurancetrianon2() { envoyerAssurance_('trianon', false); }

function savePDF2() {
  getSS_().getSheetByName(FEUILLE_ENVOI).getRange('K3').setValue(false);
  envoiManuelQuittance_('maison', true);
}
function savePDF3() {
  getSS_().getSheetByName(FEUILLE_ENVOI).getRange('M3').setValue(false);
  envoiManuelQuittance_('trianon', true);
}

function confirmer_(message) {
  let ui;
  try { ui = SpreadsheetApp.getUi(); } catch (err) { return true; }
  return ui.alert('Confirmation', message, ui.ButtonSet.YES_NO) === ui.Button.YES;
}

// Déclencheur « à la modification » (cases à cocher)
function envoimail(e) {
  const cellule = (e && e.range) ? e.range : SpreadsheetApp.getActiveRange();
  if (!cellule || cellule.getValue() !== true) return;
  const feuille = cellule.getSheet().getName();
  const a = cellule.getA1Notation();
  if (feuille === FEUILLE_ENVOI && a === 'K3') savePDF2();
  else if (feuille === FEUILLE_ENVOI && a === 'M3') savePDF3();
  else if (feuille === 'Charges' && a === 'G28') Arch1();
}

// Archivage des charges (case G28 de « Charges »)
function Arch1() {
  const ss = getSS_();
  const charges = ss.getSheetByName('Charges');
  const archives = ss.getSheetByName('Archives');
  charges.getRange('G28').setValue(false);
  archives.insertRowsBefore(5, 1);
  const sources = ['B3', 'K4', 'K10', 'D1', 'B8', 'B14', 'B23', 'B29', 'E35', 'E36'];
  const valeurs = sources.map(function (a) { return charges.getRange(a).getValue(); });
  const cible = archives.getRange('A6:J6');
  cible.setValues([valeurs]);
  archives.getRange('A5:J5').copyTo(cible, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  ss.setActiveSheet(archives);
}
