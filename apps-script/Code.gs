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
    ['alertes_actives', 'bool', 'TRUE', 'Recevoir les alertes', true],
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
    s.push([id + '.rappel_impaye', 'bool', 'FALSE', L.libelle + ' : rappel automatique si loyer impayé', true]);
    s.push([id + '.rappel_periode', 'text', '', L.libelle + ' : dernier rappel de loyer envoyé (auto)', false]);
  });
  s.push(['derniere_erreur', 'text', '', 'Dernière erreur d\'envoi (auto)', false]);
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

    Object.keys(LOGEMENTS).forEach(function (id) {
      const L = LOGEMENTS[id];

      // ---- Quittance du mois ----
      if (bool_(P[id + '.quittance_active']) && echeanceAtteinte_(P, jour, heure, annee, mois)) {
        try {
          const p = trouverPaiement_(id, periode);
          if (p && p.valide_le && !p.quittance_le) {
            envoyerQuittance_(id, periode);
          } else if ((!p || !p.valide_le) && P[id + '.alerte_periode'] !== periode) {
            alerte_(P, 'Loyer ' + L.libelle + ' non validé — quittance en attente',
              'Le paiement du loyer de ' + MOIS[mois - 1] + ' ' + annee + ' (' + L.libelle + ') n\'est pas encore validé.\n' +
              'La quittance sera envoyée dès que tu l\'auras validé dans l\'application.');
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
      }
    });

    if (erreurs.length) {
      const texte = Utilities.formatDate(now, tz, 'dd/MM/yyyy HH:mm') + ' — ' + erreurs.join(' | ');
      ecrireParam_('derniere_erreur', texte);
      alerte_(P, 'Erreur d\'envoi — Mes Locations', texte);
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

function alerte_(P, sujet, texte) {
  if (!bool_(P.alertes_actives)) return;
  const dest = String(P.email_alertes || '').trim();
  if (dest) GmailApp.sendEmail(dest, '[Mes Locations] ' + sujet, texte, { name: 'Mes Locations' });
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
    const data = executer_(req);
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
             valide_le: p.valide_le, quittance_le: p.quittance_le, pdf: p.pdf, remarque: p.remarque };
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

const COLS_PAIEMENT = ['logement', 'periode', 'montant', 'date_reception', 'valide_le', 'quittance_le', 'pdf', 'remarque'];

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
