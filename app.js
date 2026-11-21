/* Mes Locations — PWA (vanilla JS) */
'use strict';

const VERSION = '1.8.0';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const CATEGORIES = ['Taxe foncière', 'Assurance propriétaire (PNO)', 'Travaux & entretien', 'Charges de copropriété', 'Honoraires d\'agence', 'Assurance loyers impayés (GLI)', 'Frais de gestion', 'Intérêts d\'emprunt', 'Autre'];
const LS_CFG = 'ml_cfg', LS_CACHE = 'ml_cache', LS_THEME = 'ml_theme';

const S = {
  cfg: lireLS(LS_CFG) || null,     // {url, token, demo}
  data: null,                      // état renvoyé par l'API
  tab: 'accueil',
  logPaiements: null,
  filtreType: 'tout', filtreLog: 'tout',
  bilanAnnee: null, bilanLog: 'tout', declAnnee: null,
  draft: null, dirty: false
};

/* ================= Utilitaires ================= */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const euro0 = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0;
function lireLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function ecrireLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }
const vibrer = (ms = 25) => { try { navigator.vibrate?.(ms); } catch { /* ignoré */ } };

function maintenant() { return S.data?.maintenant ? new Date(S.data.maintenant) : new Date(); }
function periodeDe(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function periodeCourante() { return periodeDe(maintenant()); }
function labelPeriode(p) { return MOIS[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4); }
function moisDe(p) { return MOIS[Number(p.slice(5, 7)) - 1]; }
function dePeriode(p, delta) { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + delta, 1); return periodeDe(d); }
function parseIso(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T/]+(\d{2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; }
function fmtJour(d) { return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''; }
function fmtJourCourt(d) { return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; }
function isoJour(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function de(mot) { return /^[aeiouyhéè]/i.test(mot) ? "d'" : 'de '; }

const P = () => S.data.params;
const logements = () => S.data.logements;
const logement = (id) => logements().find((l) => l.id === id);
const paiement = (id, per) => S.data.paiements.find((p) => p.logement === id && p.periode === per);
const couleur = (id) => `var(--c-${id === 'maison' || id === 'trianon' ? id : 'commun'})`;
const estAgence = (id) => String(P()[id + '.gestion'] || '').toLowerCase() === 'agence';
const nomAgence = (id) => P()[id + '.agence_nom'] || 'l\'agence';
const releves = (id) => (S.data.releves || []).filter((r) => !id || r.logement === id).sort((x, y) => y.date.localeCompare(x.date));
const nomLoc = (l) => [l.civilite, l.prenom, l.nom].join(' ').trim() || 'Aucun locataire';

function dateEcheance(per) {
  const y = Number(per.slice(0, 4)), m = Number(per.slice(5, 7));
  const dernier = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(Number(P().quittance_jour) || 10, dernier), Number(P().quittance_heure) || 12);
}

/* ================= Statuts ================= */
function statutQuittance(l, per) {
  const p = paiement(l.id, per);
  const actif = P()[l.id + '.quittance_active'];
  const courant = per === periodeCourante();
  const ech = dateEcheance(per);
  if (estAgence(l.id) || p?.quittance_le === 'agence') {
    if (p?.valide_le) return { cls: 'ok', pill: 'Encaissé', titre: 'Encaissé via l\'agence', detail: 'relevé du ' + fmtJour(parseIso(p.date_reception)), p };
    if (courant && maintenant().getDate() >= 22) return { cls: 'warn', pill: 'Relevé à saisir', titre: 'Relevé d\'agence à saisir', detail: 'normalement reçu vers le 20 du mois', p };
    if (courant) return { cls: 'idle', pill: 'En attente', titre: 'En attente du relevé d\'agence', detail: 'vers le 20 ' + moisDe(per), p };
    return { cls: 'idle', pill: 'Non saisi', titre: 'Aucun relevé saisi', detail: '', p };
  }
  if (p?.quittance_le) return { cls: 'ok', pill: 'Envoyée', titre: 'Quittance envoyée', detail: 'le ' + fmtJour(parseIso(p.quittance_le)), p };
  if (p?.valide_le) {
    if (!actif) return { cls: 'info', pill: 'Payé', titre: 'Paiement validé', detail: 'Envoi automatique désactivé', p };
    if (courant && ech > maintenant()) return { cls: 'info', pill: 'Payé', titre: 'Payé — quittance prévue', detail: 'le ' + fmtJour(ech) + ' à ' + ech.getHours() + ' h', p };
    if (courant) return { cls: 'info', pill: 'Payé', titre: 'Payé — envoi imminent', detail: 'à la prochaine vérification horaire', p };
    return { cls: 'warn', pill: 'Sans quittance', titre: 'Payé — quittance non envoyée', detail: 'Tu peux l\'envoyer manuellement', p };
  }
  if (!actif) return { cls: 'idle', pill: 'Désactivé', titre: 'Envois désactivés', detail: 'Active-les dans Réglages', p };
  if (courant && ech <= maintenant()) return { cls: 'danger', pill: 'À valider', titre: 'Loyer ' + de(moisDe(per)) + moisDe(per) + ' non validé', detail: 'Échéance passée le ' + fmtJour(ech), p };
  if (courant) return { cls: 'warn', pill: 'À valider', titre: 'Loyer ' + de(moisDe(per)) + moisDe(per) + ' à valider', detail: 'Échéance le ' + fmtJour(ech), p };
  return { cls: 'idle', pill: 'Non enregistré', titre: 'Aucun paiement enregistré', detail: '', p };
}

function prochaineDemandeAssurance() {
  const n = maintenant(), y = n.getFullYear();
  const d = new Date(y, Number(P().assurance_mois) - 1, Number(P().assurance_jour));
  return d >= n ? d : new Date(y + 1, d.getMonth(), d.getDate());
}

function statutAssurance(l) {
  const pr = P(), y = maintenant().getFullYear();
  if (!pr[l.id + '.assurance_active']) return { cls: 'idle', titre: 'Demande d\'attestation désactivée', detail: '' };
  if (String(pr[l.id + '.assurance_recue']) === String(y)) return { cls: 'ok', titre: 'Attestation ' + y + ' reçue', detail: 'Prochaine demande le ' + fmtJour(prochaineDemandeAssurance()) };
  const env = parseIso(pr[l.id + '.assurance_envoyee']);
  if (env && env.getFullYear() === y) {
    const rel = parseIso(pr[l.id + '.derniere_relance']);
    let detail = 'Demandée le ' + fmtJour(env) + (rel ? ' · relancée le ' + fmtJour(rel) : '');
    if (pr.relance_active) {
      const proch = new Date((rel || env).getTime() + Number(pr.relance_jours) * 86400000);
      detail += ' · relance auto le ' + fmtJourCourt(proch);
    }
    return { cls: 'warn', titre: 'Attestation ' + y + ' en attente', detail };
  }
  return { cls: 'info', titre: 'Prochaine demande d\'attestation', detail: 'le ' + fmtJour(prochaineDemandeAssurance()) };
}

/* ================= Finances ================= */
// Encaissements par logement et par mois : paiements validés (onglet Paiements) complétés par l'historique (onglet Principale)
function encaissements() {
  const m = new Map();
  (S.data.historique || []).forEach((h) => {
    const per = h.date.slice(0, 7);
    if (h.maison > 0) m.set('maison|' + per, { logement: 'maison', periode: per, montant: h.maison, source: 'historique' });
    if (h.trianon > 0) m.set('trianon|' + per, { logement: 'trianon', periode: per, montant: h.trianon, source: 'historique' });
  });
  S.data.paiements.filter((p) => p.valide_le).forEach((p) => {
    m.set(p.logement + '|' + p.periode, { logement: p.logement, periode: p.periode, montant: num(p.montant), date_reception: p.date_reception,
      source: p.quittance_le === 'agence' ? 'agence' : 'paiement', charges: p.charges !== undefined && p.charges !== '' ? num(p.charges) : null });
  });
  return [...m.values()];
}

function anneesDisponibles() {
  const ys = new Set([String(maintenant().getFullYear())]);
  encaissements().forEach((e) => ys.add(e.periode.slice(0, 4)));
  (S.data.depenses || []).forEach((d) => ys.add(d.date.slice(0, 4)));
  return [...ys].sort().reverse();
}

function bilan(annee, filtre) {
  const garde = (id) => filtre === 'tout' || id === filtre;
  const enc = encaissements().filter((e) => e.periode.startsWith(annee) && garde(e.logement));
  const dep = (S.data.depenses || []).filter((d) => d.date.startsWith(annee) && (filtre === 'tout' || d.logement === filtre));
  const mois = Array.from({ length: 12 }, (_, i) => ({ i, in: 0, out: 0 }));
  enc.forEach((e) => { mois[Number(e.periode.slice(5, 7)) - 1].in += e.montant; });
  dep.forEach((d) => { mois[Number(d.date.slice(5, 7)) - 1].out += d.montant; });
  const totalIn = enc.reduce((t, e) => t + e.montant, 0);
  const totalOut = dep.reduce((t, d) => t + d.montant, 0);
  const avecDate = enc.filter((e) => e.source === 'paiement' && e.date_reception);
  const aLHeure = avecDate.filter((e) => parseIso(e.date_reception) <= dateEcheance(e.periode)).length;
  const parCat = {};
  dep.forEach((d) => { parCat[d.categorie] = (parCat[d.categorie] || 0) + d.montant; });
  // Charges récupérables estimées (charges actuelles × nombre de mois encaissés)
  const chargesEstim = enc.reduce((t, e) => t + (e.charges !== null && e.charges !== undefined ? e.charges : (logement(e.logement)?.charges || 0)), 0);
  return { enc, dep, mois, totalIn, totalOut, net: totalIn - totalOut, nbMois: enc.length,
           ponctualite: avecDate.length ? Math.round(100 * aLHeure / avecDate.length) : null, nbPonct: avecDate.length, parCat, chargesEstim };
}

/* ================= API ================= */
async function api(action, payload = {}) {
  if (S.cfg?.demo) return demoApi(action, payload);
  const res = await fetch(S.cfg.url, { method: 'POST', body: JSON.stringify({ token: S.cfg.token, action, ...payload }) });
  if (!res.ok) throw new Error('Serveur injoignable (HTTP ' + res.status + ')');
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'Erreur inconnue');
  return j.data;
}

function normaliser(d) {
  d.depenses = d.depenses || [];
  d.releves = d.releves || [];
  d.historique = d.historique || [];
  return d;
}

async function charger(silencieux) {
  const btn = $('#btnRefresh');
  btn.classList.add('spin');
  try {
    S.data = normaliser(await api('etat'));
    if (!S.cfg.demo) ecrireLS(LS_CACHE, S.data);
    if (!S.dirty) S.draft = null;
    rendre();
    traiterLien();
  } catch (e) {
    if (!silencieux || !S.data) toast(e.message, true);
    if (!S.data) rendreErreurConnexion(e.message);
  } finally {
    btn.classList.remove('spin');
  }
}

async function action(label, nom, payload, succes, annuler) {
  chargement(true, label);
  try {
    S.data = normaliser(await api(nom, payload));
    if (!S.cfg.demo) ecrireLS(LS_CACHE, S.data);
    fermerSheet();
    rendre();
    vibrer();
    if (succes) toast(succes, false, annuler);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  } finally {
    chargement(false);
  }
}

/* ================= UI de base ================= */
let toastTimer;
function toast(msg, err, act) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${act ? `<button type="button">${esc(act.label)}</button>` : ''}`;
  t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  if (act) t.querySelector('button').onclick = () => { t.hidden = true; act.fn(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 5000 : act ? 6000 : 2800);
}
function chargement(on, txt) { $('#loader').hidden = !on; if (txt) $('#loaderTxt').textContent = txt; }

function ouvrirSheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false; $('#sheetBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function fermerSheet() {
  $('#sheet').hidden = true; $('#sheetBackdrop').hidden = true;
  document.body.style.overflow = '';
}
function confirmer(titre, texte, ok = 'Confirmer', danger = false) {
  return new Promise((resolve) => {
    ouvrirSheet(`<h3>${esc(titre)}</h3><p class="sub">${esc(texte)}</p>
      <div class="actions"><button class="btn ghost grow" id="cNo">Annuler</button>
      <button class="btn ${danger ? 'danger' : 'primary'} grow" id="cOk">${esc(ok)}</button></div>`);
    $('#cNo').onclick = () => { fermerSheet(); resolve(false); };
    $('#cOk').onclick = () => { fermerSheet(); resolve(true); };
  });
}

function setTitre(eyebrow, titre) { $('#eyebrow').textContent = eyebrow; $('#titre').textContent = titre; }

let derniereVue = '';
function rendre() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  $('#demoBadge').hidden = !S.cfg?.demo;
  $('#tabbar').hidden = !S.cfg;
  $('#btnRefresh').hidden = !S.cfg;
  if (!S.cfg) return rendreOnboarding();
  if (!S.data) { $('#vue').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  ({ accueil: vueAccueil, paiements: vuePaiements, bilan: vueBilan, historique: vueHistorique, reglages: vueReglages })[S.tab]();
  if (derniereVue !== S.tab) {
    const v = $('#vue'); v.classList.remove('fade'); void v.offsetWidth; v.classList.add('fade');
    derniereVue = S.tab;
  }
}

/* ================= Accueil ================= */
function tachesAFaire() {
  const t = [];
  const per = periodeCourante();
  const prec = dePeriode(per, -1);
  const n = maintenant();
  const pr = P();
  const jours = (d) => Math.ceil((d - n) / 86400000);
  if (pr.derniere_erreur) {
    t.push({ cls: 'danger', ico: '!', titre: 'Erreur d\'envoi', detail: pr.derniere_erreur,
      actions: [['ghost', 'Effacer', 'effacerErreur', '']] });
  }
  logements().forEach((l) => {
    if (estAgence(l.id) || !pr[l.id + '.quittance_active']) return;
    [prec, per].forEach((pe) => {
      const p = paiement(l.id, pe);
      const ech = dateEcheance(pe);
      const j = jours(ech);
      // Mois précédent : seulement s'il reste quelque chose à faire et que l'appli suivait déjà ce logement
      if (pe === prec && !S.data.paiements.some((x) => x.logement === l.id && x.periode < per)) return;
      if (!p?.valide_le) {
        const cls = j <= 0 ? 'danger' : j <= 7 ? 'warn' : 'info';
        const quand = j <= 0 ? 'échéance passée le ' + fmtJour(ech) : 'échéance le ' + fmtJour(ech) + (j > 1 ? ' (dans ' + j + ' jours)' : ' (demain)');
        t.push({ cls, ico: '€', log: l.id, titre: `Loyer ${de(moisDe(pe))}${moisDe(pe)} à valider — ${l.libelle}`,
          detail: `${euro(l.loyer)} · ${quand}`,
          actions: [['primary', 'Payé ✓', 'payeRapide', pe], ['ghost', 'Autre montant', 'paiement', pe]]
            .concat(j <= 0 ? [['ghost', 'Rappel', 'rappelLoyer', pe]] : []) });
      } else if (!p.quittance_le && ech <= n) {
        t.push({ cls: 'warn', ico: '✉', log: l.id, titre: `Quittance ${de(moisDe(pe))}${moisDe(pe)} à envoyer — ${l.libelle}`,
          detail: 'Paiement validé, quittance pas encore partie', actions: [['primary', 'Envoyer', 'envoyerQ', pe]] });
      }
    });
  });
  logements().forEach((l) => {
    if (!estAgence(l.id)) return;
    [prec, per].forEach((pe) => {
      if (paiement(l.id, pe)?.valide_le) return;
      if (pe === prec && !S.data.paiements.some((x) => x.logement === l.id && x.periode < prec)) return;
      const enRetard = pe === prec || n.getDate() >= 22;
      t.push({ cls: enRetard ? 'warn' : 'info', ico: '▤', log: l.id, titre: `Relevé d'agence ${de(moisDe(pe))}${moisDe(pe)} à saisir — ${l.libelle}`,
        detail: enRetard ? `${nomAgence(l.id)} l'envoie normalement vers le 20` : 'À venir : compte rendu de gestion vers le 20 ' + moisDe(pe),
        actions: [['primary', 'Saisir le relevé', 'ajouterReleve', pe]] });
    });
  });
  logements().forEach((l) => {
    if (estAgence(l.id)) return;
    const a = statutAssurance(l);
    if (a.cls === 'warn') {
      t.push({ cls: 'warn', ico: '☂', log: l.id, titre: `${a.titre} — ${l.libelle}`, detail: a.detail,
        actions: [['primary', 'Attestation reçue', 'recueBtn', ''], ['ghost', 'Relancer', 'envoyerA', '', '1']] });
    }
  });
  const ordre = { danger: 0, warn: 1, info: 2 };
  return t.sort((x, y) => ordre[x.cls] - ordre[y.cls]);
}

function vueAccueil() {
  const n = maintenant();
  setTitre(n.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), 'Bonjour Chris');
  const per = periodeCourante();
  const annee = String(n.getFullYear());
  const b = bilan(annee, 'tout');
  let h = '';

  // Indicateurs
  h += `<div class="kpis">
    <button class="kpi" data-act="tab" data-tab="bilan"><div class="k-label">Encaissé</div><div class="k-value">${euro0(b.totalIn)}</div><div class="k-sub">${annee}</div></button>
    <button class="kpi" data-act="tab" data-tab="bilan"><div class="k-label">Net</div><div class="k-value">${euro0(b.net)}</div><div class="k-sub">${annee}</div></button>
    <button class="kpi" data-act="tab" data-tab="bilan"><div class="k-label">Ponctualité</div><div class="k-value">${b.ponctualite === null ? '—' : b.ponctualite + ' %'}</div><div class="k-sub">${annee}</div></button>
  </div>`;

  // À faire
  const taches = tachesAFaire();
  h += taches.length
    ? `<p class="section-title alerte"><span class="badge-alerte">${taches.length}</span>À faire</p>`
    : `<p class="section-title">À faire</p>`;
  if (!taches.length) {
    h += `<div class="todo"><div class="todo-ok"><div class="todo-ico st-ok">✓</div><div class="todo-txt"><strong>Tout est à jour</strong><small>Aucune action requise pour l'instant</small></div></div></div>`;
  } else {
    h += `<div class="todo alerte">` + taches.map((t) => `<div class="todo-item urg-${t.cls}">
      <div class="todo-head"><div class="todo-ico st-${t.cls}">${t.ico}</div>
        <div class="todo-txt"><strong>${t.log ? `<span class="log-dot" style="--lc:${couleur(t.log)}"></span>` : ''}${esc(t.titre)}</strong><small>${esc(t.detail)}</small></div></div>
      <div class="todo-actions">${t.actions.map(([cls, lbl, act, per, rel]) =>
        `<button class="btn ${cls}" data-act="${act}" data-log="${t.log || ''}" data-per="${per}"${rel ? ' data-relance="1"' : ''}>${esc(lbl)}</button>`).join('')}</div>
    </div>`).join('') + `</div>`;
  }

  // Logements
  const actifs = logements().filter((l) => estAgence(l.id) || P()[l.id + '.quittance_active'] || P()[l.id + '.assurance_active'] || paiement(l.id, per));
  const inactifs = logements().filter((l) => !actifs.includes(l));
  h += `<p class="section-title">Mes logements</p>`;
  actifs.forEach((l) => {
    const s = statutQuittance(l, per);
    if (estAgence(l.id)) {
      const r = releves(l.id)[0];
      h += `<article class="card log" style="--lc:${couleur(l.id)}" data-act="voirLogement" data-log="${l.id}">
        <div class="card-head">
          <div><h2>${esc(l.libelle)}</h2><p class="sub">Géré par ${esc(nomAgence(l.id))}</p></div>
          <span class="pill ${s.cls}">${esc(s.pill)}</span>
        </div>
        <p class="amount">${r ? euro(r.net) : '—'} <small>· ${r ? 'net viré le ' + esc(fmtJour(parseIso(r.date))) : 'aucun relevé'}</small></p>
        <div class="mini-status ${s.cls}"><i class="dot"></i><span><b>${esc(s.titre)}</b>${s.detail ? ' · ' + esc(s.detail) : ''}</span></div>
        ${r ? `<div class="mini-status idle"><i class="dot"></i><span>Dernier relevé : ${euro(r.loyers + r.provisions)} encaissés − ${euro(r.frais)} de frais</span></div>` : ''}
      </article>`;
      return;
    }
    const a = statutAssurance(l);
    const montant = s.p?.montant ? num(s.p.montant) : l.loyer;
    h += `<article class="card log" style="--lc:${couleur(l.id)}" data-act="paiement" data-log="${l.id}" data-per="${per}">
      <div class="card-head">
        <div><h2>${esc(l.libelle)}</h2><p class="sub">${esc(nomLoc(l))}</p></div>
        <span class="pill ${s.cls}">${esc(s.pill)}</span>
      </div>
      <p class="amount">${euro(montant)} <small>· ${esc(cap(labelPeriode(per)))}</small></p>
      <div class="mini-status ${s.cls}"><i class="dot"></i><span><b>${esc(s.titre)}</b>${s.detail ? ' · ' + esc(s.detail) : ''}</span></div>
      <div class="mini-status ${a.cls}"><i class="dot"></i><span>${esc(a.titre)}</span></div>
    </article>`;
  });
  if (inactifs.length) {
    h += `<div class="list">` + inactifs.map((l) =>
      `<button class="row" data-act="tab" data-tab="reglages"><div class="ico st-idle"><span class="log-dot" style="--lc:${couleur(l.id)};margin:0"></span></div><div class="grow"><div class="title">${esc(l.libelle)}</div>
       <div class="meta">${esc([l.prenom, l.nom].join(' ').trim() || 'Aucun locataire')} · envois désactivés</div></div><span class="chev">›</span></button>`).join('') + `</div>`;
  }

  // Échéances
  const ech = dateEcheance(per) > n ? dateEcheance(per) : dateEcheance(dePeriode(per, 1));
  h += `<p class="section-title">Prochaines échéances</p><div class="card">
    <div class="line-item"><span class="label">Quittances</span><span class="value">${esc(fmtJour(ech))} · ${ech.getHours()} h</span></div>
    <div class="line-item"><span class="label">Demande d'attestation</span><span class="value">${esc(fmtJour(prochaineDemandeAssurance()))}</span></div>
    <div class="line-item"><span class="label">Rappel si impayé</span><span class="value">${logements().some((l) => P()[l.id + '.rappel_impaye']) ? P().rappel_impaye_jours + ' j après l\'échéance' : 'Désactivé'}</span></div>
  </div>`;

  $('#vue').innerHTML = h;
}

/* ================= Paiements ================= */
function vuePaiements() {
  setTitre('Suivi des loyers', 'Paiements');
  if (!S.logPaiements) S.logPaiements = (logements().find((l) => P()[l.id + '.quittance_active']) || logements()[0]).id;
  const l = logement(S.logPaiements);
  const cur = periodeCourante();
  const periodes = Array.from({ length: 12 }, (_, i) => dePeriode(cur, -i));
  const annee = cur.slice(0, 4);
  const b = bilan(annee, l.id);

  let h = `<div class="segmented">${logements().map((x) => `<button data-act="logPaiements" data-log="${x.id}" class="${x.id === l.id ? 'on' : ''}"><span class="log-dot" style="--lc:${couleur(x.id)}"></span>${esc(x.libelle)}</button>`).join('')}</div>`;
  h += `<div class="card"><div class="card-head"><div><p class="sub">Encaissé en ${annee}</p><p class="amount" style="margin-top:4px">${euro(b.totalIn)}</p></div>
        <span class="pill info">${b.nbMois} mois</span></div>
        <p class="sub">${estAgence(l.id) ? 'Géré par ' + esc(nomAgence(l.id)) + ' · montants bruts encaissés par l\'agence' : 'Loyer attendu : ' + euro(l.loyer) + (l.charges ? ' dont ' + euro(l.charges) + ' de charges' : '')}</p></div>`;
  if (estAgence(l.id)) {
    const rs = releves(l.id);
    h += `<p class="section-title">Relevés de l'agence</p><div class="list">` + (rs.length ? rs.map((r) =>
      `<button class="row" data-act="voirReleve" data-v="${esc(r.id)}">
        <div class="ico st-info">▤</div>
        <div class="grow"><div class="title">Relevé du ${esc(fmtJour(parseIso(r.date)))} ${esc(r.date.slice(0, 4))}</div>
        <div class="meta">${esc(r.periodes.split(', ').map(labelPeriode).join(' + '))} · ${euro(r.loyers + r.provisions)} − ${euro(r.frais)}${r.pdf ? ' · PDF' : ' · sans PDF'}</div></div>
        <b>${euro(r.net)}</b></button>`).join('') : '<p class="empty">Aucun relevé</p>') + `</div>
      <div class="actions"><button class="btn primary block" data-act="ajouterReleve" data-log="${l.id}" data-per="${cur}">+ Ajouter un relevé</button></div>
      <p class="section-title">Loyers par mois</p>`;
  }
  h += `<div class="list">` + periodes.map((per) => {
    const s = statutQuittance(l, per);
    const hist = !s.p && encaissements().find((e) => e.logement === l.id && e.periode === per);
    const ico = s.cls === 'ok' ? '✓' : s.cls === 'info' ? '€' : s.cls === 'danger' || s.cls === 'warn' ? '!' : '·';
    const meta = s.p?.valide_le ? euro(num(s.p.montant)) + (s.p.date_reception ? ' · reçu le ' + fmtJourCourt(parseIso(s.p.date_reception)) : '')
      : hist ? euro(hist.montant) + ' · historique du tableur' : s.detail || '—';
    const pill = hist && s.cls === 'idle' ? ['ok', 'Encaissé'] : [s.cls, s.pill];
    return `<button class="row" data-act="paiement" data-log="${l.id}" data-per="${per}">
      <div class="ico st-${hist && s.cls === 'idle' ? 'ok' : s.cls}">${hist && s.cls === 'idle' ? '✓' : ico}</div>
      <div class="grow"><div class="title">${esc(cap(labelPeriode(per)))}</div><div class="meta">${esc(meta)}</div></div>
      <span class="pill ${pill[0]}">${esc(pill[1])}</span></button>`;
  }).join('') + `</div>`;
  $('#vue').innerHTML = h;
}

function ouvrirPaiement(id, per) {
  const l = logement(id);
  const p = paiement(id, per);
  const titre = 'Loyer ' + de(moisDe(per)) + labelPeriode(per);
  if (estAgence(id) || p?.quittance_le === 'agence') {
    if (!p?.valide_le) return ouvrirReleve(null, id, per);
    const relId = (String(p.remarque).match(/\[(R\w+)\]/) || [])[1];
    ouvrirSheet(`<h3>${esc(cap(titre))}</h3><p class="sub"><span class="log-dot" style="--lc:${couleur(id)}"></span>${esc(l.libelle)} · encaissé par ${esc(nomAgence(id))}</p>
      <div class="card" style="padding:4px 16px">
        <div class="line-item"><span class="label">Montant encaissé</span><span class="value">${euro(num(p.montant))}</span></div>
        ${p.charges ? `<div class="line-item"><span class="label">dont provisions/charges</span><span class="value">${euro(num(p.charges))}</span></div>` : ''}
        <div class="line-item"><span class="label">Relevé du</span><span class="value">${esc(fmtJour(parseIso(p.date_reception)))}</span></div>
        <div class="line-item"><span class="label">Détail</span><span class="value">${esc(String(p.remarque).replace(/\s*\[R\w+\]/, ''))}</span></div>
      </div>
      <div class="actions">
        ${p.pdf && p.pdf !== '#' ? `<a class="btn ghost grow" href="${esc(p.pdf)}" target="_blank" rel="noopener">Ouvrir le relevé PDF</a>` : ''}
        ${relId ? `<button class="btn ghost grow" data-act="voirReleve" data-v="${esc(relId)}">Voir le relevé</button>` : ''}
      </div>`);
    return;
  }
  if (!p?.valide_le) {
    const echPassee = dateEcheance(per) <= maintenant();
    const envoyerDefaut = P()[id + '.quittance_active'] && P().envoi_a_la_validation && echPassee;
    const rappelEnvoye = P()[id + '.rappel_periode'] === per;
    ouvrirSheet(`<h3>${esc(cap(titre))}</h3><p class="sub"><span class="log-dot" style="--lc:${couleur(id)}"></span>${esc(l.libelle)} · ${esc(nomLoc(l))}</p>
      <label class="field"><span>Montant reçu (€)</span><input class="input" id="fMontant" inputmode="decimal" value="${esc(String(l.loyer).replace('.', ','))}"></label>
      <label class="field"><span>Date de réception</span><input class="input" type="date" id="fDate" value="${isoJour(maintenant())}"></label>
      <p class="hint">Le jour de réception figurera sur la quittance (« Date du paiement »).</p>
      <label class="field"><span>Remarque (facultatif)</span><input class="input" id="fRem" placeholder="Virement, chèque…"></label>
      <div class="card" style="padding:4px 16px">
        <div class="toggle-row"><div class="txt"><strong>Envoyer la quittance maintenant</strong>
          <small>${echPassee ? 'Sinon, envoi manuel depuis l\'application' : 'Sinon, envoi automatique le ' + esc(fmtJour(dateEcheance(per)))}</small></div>
          <label class="switch"><input type="checkbox" id="fEnvoyer" ${envoyerDefaut ? 'checked' : ''}><span></span></label></div>
      </div>
      <button class="btn primary block" id="fValider">Valider le paiement</button>
      ${echPassee ? `<button class="btn ghost block" style="margin-top:10px" data-act="rappelLoyer" data-log="${id}" data-per="${per}">${rappelEnvoye ? 'Renvoyer un rappel de paiement' : 'Envoyer un rappel de paiement'}</button>
        ${rappelEnvoye ? '<p class="note">Un rappel a déjà été envoyé pour ce mois.</p>' : ''}` : ''}`);
    $('#fValider').onclick = () => {
      const montant = num($('#fMontant').value);
      if (!(montant > 0)) return toast('Montant invalide', true);
      const envoyer = $('#fEnvoyer').checked;
      action(envoyer ? 'Validation et envoi de la quittance…' : 'Validation…', 'validerPaiement',
        { logement: id, periode: per, montant: montant.toFixed(2), date: $('#fDate').value, remarque: $('#fRem').value.trim(), envoyer },
        envoyer ? 'Paiement validé, quittance envoyée' : 'Paiement validé');
    };
    return;
  }
  const s = statutQuittance(l, per);
  ouvrirSheet(`<h3>${esc(cap(titre))}</h3><p class="sub"><span class="log-dot" style="--lc:${couleur(id)}"></span>${esc(l.libelle)} · ${esc(nomLoc(l))}</p>
    <div class="card" style="padding:4px 16px">
      <div class="line-item"><span class="label">Montant</span><span class="value">${euro(num(p.montant))}</span></div>
      <div class="line-item"><span class="label">Reçu le</span><span class="value">${esc(fmtJour(parseIso(p.date_reception)))}</span></div>
      <div class="line-item"><span class="label">Validé le</span><span class="value">${esc(fmtJour(parseIso(p.valide_le)))}</span></div>
      ${p.remarque ? `<div class="line-item"><span class="label">Remarque</span><span class="value">${esc(p.remarque)}</span></div>` : ''}
      <div class="line-item"><span class="label">Quittance</span><span class="value">${p.quittance_le ? 'envoyée le ' + esc(fmtJour(parseIso(p.quittance_le))) : 'non envoyée'}</span></div>
    </div>
    <div class="status st-${s.cls}" style="margin:0 0 14px"><i class="dot"></i><div><strong>${esc(s.titre)}</strong>${s.detail ? `<span class="small">${esc(s.detail)}</span>` : ''}</div></div>
    <div class="actions">
      ${p.pdf && p.pdf !== '#' ? `<a class="btn ghost grow" href="${esc(p.pdf)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : ''}
      <button class="btn ghost grow" data-act="apercuQ" data-log="${id}" data-per="${per}">Aperçu</button>
      <button class="btn primary block" data-act="envoyerQ" data-log="${id}" data-per="${per}">${p.quittance_le ? 'Renvoyer la quittance' : 'Envoyer la quittance'}</button>
      ${!p.quittance_le ? `<button class="btn danger block" data-act="annulerP" data-log="${id}" data-per="${per}">Annuler la validation</button>` : ''}
    </div>`);
}

async function payeRapide(id, per) {
  const l = logement(id);
  if (!(l.loyer > 0)) return ouvrirPaiement(id, per);
  const envoyer = P()[id + '.quittance_active'] && P().envoi_a_la_validation && dateEcheance(per) <= maintenant();
  if (envoyer && !await confirmer('Valider et envoyer la quittance ?',
    `${euro(l.loyer)} reçus aujourd'hui. La quittance ${de(moisDe(per))}${labelPeriode(per)} part tout de suite à ${l.email || '(adresse manquante)'}.`, 'Valider et envoyer')) return;
  action(envoyer ? 'Validation et envoi…' : 'Validation…', 'validerPaiement',
    { logement: id, periode: per, montant: l.loyer.toFixed(2), date: isoJour(maintenant()), remarque: '', envoyer },
    envoyer ? 'Payé · quittance envoyée' : 'Loyer validé',
    envoyer ? null : { label: 'Annuler', fn: () => action('Annulation…', 'annulerPaiement', { logement: id, periode: per }, 'Validation annulée') });
}

/* ================= Relevés d'agence ================= */
function lirePdf(fichier) {
  return new Promise((resolve, reject) => {
    if (!fichier) return resolve(null);
    if (fichier.type && fichier.type !== 'application/pdf') return reject(new Error('Choisis un fichier PDF'));
    if (fichier.size > 8 * 1024 * 1024) return reject(new Error('PDF trop volumineux (8 Mo maximum)'));
    const lr = new FileReader();
    lr.onload = () => resolve({ nom: fichier.name, base64: String(lr.result).split(',')[1] });
    lr.onerror = () => reject(new Error('Lecture du PDF impossible'));
    lr.readAsDataURL(fichier);
  });
}

function ouvrirReleve(r, id, per) {
  if (r) {
    ouvrirSheet(`<h3>Relevé du ${esc(fmtJour(parseIso(r.date)))} ${esc(r.date.slice(0, 4))}</h3>
      <p class="sub"><span class="log-dot" style="--lc:${couleur(r.logement)}"></span>${esc(logement(r.logement)?.libelle || r.logement)} · ${esc(nomAgence(r.logement))}</p>
      <div class="card" style="padding:4px 16px">
        <div class="line-item"><span class="label">Période(s)</span><span class="value">${esc(r.periodes.split(', ').map(labelPeriode).join(' + '))}</span></div>
        <div class="line-item"><span class="label">Loyers</span><span class="value">${euro(r.loyers)}</span></div>
        <div class="line-item"><span class="label">Provisions / charges</span><span class="value">${euro(r.provisions)}</span></div>
        <div class="line-item"><span class="label">Frais déduits</span><span class="value">− ${euro(r.frais)}</span></div>
        <div class="line-item"><span class="label"><b>Net viré</b></span><span class="value">${euro(r.net)}</span></div>
        ${r.remarque ? `<div class="line-item"><span class="label">Remarque</span><span class="value">${esc(r.remarque)}</span></div>` : ''}
      </div>
      <p class="hint">Les frais sont enregistrés comme dépenses (onglet Bilan) et les loyers comme encaissements.</p>
      <div class="actions">
        ${r.pdf ? `<a class="btn ghost grow" href="${esc(r.pdf)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : ''}
        <label class="btn ${r.pdf ? 'ghost' : 'primary'} grow" style="cursor:pointer">${r.pdf ? 'Remplacer le PDF' : 'Joindre le PDF'}
          <input type="file" accept="application/pdf" id="rPdf" hidden></label>
        <button class="btn danger block" id="rSuppr">Supprimer ce relevé</button>
      </div>`);
    $('#rPdf').onchange = async (e) => {
      try {
        const pdf = await lirePdf(e.target.files[0]);
        if (pdf) action('Envoi du PDF…', 'joindrePdfReleve', { id: r.id, pdf }, 'PDF archivé dans Drive');
      } catch (err) { toast(err.message, true); }
    };
    $('#rSuppr').onclick = async () => {
      if (!await confirmer('Supprimer ce relevé ?', 'Les loyers et les frais qu\'il a enregistrés seront aussi supprimés.', 'Supprimer', true)) return;
      action('Suppression…', 'supprimerReleve', { id: r.id }, 'Relevé supprimé');
    };
    return;
  }
  // Nouveau relevé, pré-rempli avec le dernier
  const der = releves(id)[0];
  const derPai = der && S.data.paiements.find((p) => p.logement === id && String(p.remarque).includes('[' + der.id + ']') && p.periode === der.periodes.split(', ').slice(-1)[0]);
  const fraisDer = der ? (S.data.depenses || []).filter((d) => d.id.startsWith(der.id + '-')) : [];
  const fGestion = fraisDer.find((d) => /gestion/i.test(d.libelle));
  const fGli = fraisDer.find((d) => /GLI/.test(d.categorie));
  const v = (x) => x ? String(Number(x).toFixed(2)).replace('.', ',') : '';
  ouvrirSheet(`<h3>Nouveau relevé d'agence</h3><p class="sub">${esc(logement(id).libelle)} · choisis le PDF du compte rendu de gestion : les montants sont lus automatiquement.</p>
    <label class="btn primary block" style="cursor:pointer;margin-bottom:6px">Lire le PDF du relevé
      <input type="file" accept="application/pdf" id="rLire" hidden></label>
    <p class="hint" style="text-align:center;margin:6px 0 14px">ou saisis les montants à la main :</p>
    <div class="grid2">
      <label class="field"><span>Date du relevé</span><input class="input" type="date" id="rDate" value="${isoJour(maintenant())}"></label>
      <label class="field"><span>Mois du loyer</span><input class="input" type="month" id="rPer" value="${esc(per || periodeCourante())}"></label>
      <label class="field"><span>Loyer (€)</span><input class="input rCalc" id="rLoyer" inputmode="decimal" value="${derPai ? v(num(derPai.montant) - num(derPai.charges)) : ''}"></label>
      <label class="field"><span>Provisions / charges (€)</span><input class="input rCalc" id="rProv" inputmode="decimal" value="${derPai ? v(derPai.charges) : ''}"></label>
      <label class="field"><span>Honoraires de gestion TTC (€)</span><input class="input rCalc" id="rGest" inputmode="decimal" value="${fGestion ? v(fGestion.montant) : ''}"></label>
      <label class="field"><span>Cotisation GLI (€)</span><input class="input rCalc" id="rGli" inputmode="decimal" value="${fGli ? v(fGli.montant) : ''}"></label>
      <label class="field"><span>Autres frais (€)</span><input class="input rCalc" id="rAutre" inputmode="decimal" placeholder="0"></label>
      <label class="field"><span>Libellé autres frais</span><input class="input" id="rAutreLib" placeholder="ex. travaux"></label>
    </div>
    <div class="card" style="padding:4px 16px"><div class="line-item"><span class="label"><b>Net viré calculé</b></span><span class="value" id="rNet">—</span></div></div>
    <label class="field"><span>PDF du relevé (facultatif)</span><input class="input" type="file" accept="application/pdf" id="rFichier"></label>
    <label class="field"><span>Remarque (facultatif)</span><input class="input" id="rRem"></label>
    <button class="btn primary block" id="rOk">Enregistrer le relevé</button>`);
  const calc = () => {
    const net = num($('#rLoyer').value) + num($('#rProv').value) - num($('#rGest').value) - num($('#rGli').value) - num($('#rAutre').value);
    $('#rNet').textContent = euro(net);
    return net;
  };
  document.querySelectorAll('.rCalc').forEach((i) => i.addEventListener('input', calc));
  calc();
  $('#rLire').onchange = async (e) => {
    let pdf;
    try { pdf = await lirePdf(e.target.files[0]); } catch (err) { return toast(err.message, true); }
    if (!pdf) return;
    chargement(true, 'Lecture du relevé…');
    try {
      const r = await api('analyserReleve', { logement: id, pdf });
      chargement(false);
      ouvrirReleveLu(id, r, pdf);
    } catch (err) {
      chargement(false);
      toast(err.message + ' — saisis les montants à la main', true);
    }
  };
  $('#rOk').onclick = async () => {
    const loyer = num($('#rLoyer').value);
    if (!(loyer > 0)) return toast('Loyer invalide', true);
    if (!$('#rDate').value || !/^\d{4}-\d{2}$/.test($('#rPer').value)) return toast('Date ou mois manquant', true);
    let pdf = null;
    try { pdf = await lirePdf($('#rFichier').files[0]); } catch (err) { return toast(err.message, true); }
    const frais = [];
    if (num($('#rGest').value)) frais.push({ categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion', montant: num($('#rGest').value).toFixed(2) });
    if (num($('#rGli').value)) frais.push({ categorie: 'Assurance loyers impayés (GLI)', libelle: 'Cotisation garantie des loyers impayés', montant: num($('#rGli').value).toFixed(2) });
    if (num($('#rAutre').value)) frais.push({ categorie: 'Autre', libelle: $('#rAutreLib').value.trim() || 'Autres frais', montant: num($('#rAutre').value).toFixed(2) });
    action(pdf ? 'Enregistrement et archivage du PDF…' : 'Enregistrement…', 'ajouterReleve', {
      logement: id, date: $('#rDate').value, net: calc().toFixed(2), remarque: $('#rRem').value.trim(), pdf,
      lignes: [{ periode: $('#rPer').value, loyer: loyer.toFixed(2), provisions: num($('#rProv').value).toFixed(2) }], frais
    }, 'Relevé enregistré');
  };
}

// Résultat de la lecture d'un PDF : résumé + enregistrement en un geste
function ouvrirReleveLu(id, r, pdf) {
  const ligne = (l, v, cls = '') => `<div class="line-item"><span class="label">${l}</span><span class="value ${cls}" style="white-space:nowrap">${v}</span></div>`;
  const rempl = (r.existants || []).length > 0;
  let h = `<h3>Relevé du ${esc(fmtJour(parseIso(r.date)))} ${esc(r.date.slice(0, 4))}</h3>
    <p class="sub">${esc(logement(id).libelle)} · montants lus dans le PDF, vérifiés (le total correspond au net viré).</p>
    <div class="card" style="padding:4px 16px">`;
  r.lignes.forEach((l) => {
    h += ligne('Loyer ' + esc(labelPeriode(l.periode)), euro(l.loyer));
    if (num(l.provisions)) h += ligne('Provisions / charges' + (l.detail ? ' <small>(' + esc(l.detail) + ')</small>' : ''), euro(l.provisions));
  });
  r.frais.forEach((f) => { const m = num(f.montant); h += ligne(esc(f.libelle), (m < 0 ? '+ ' : '− ') + euro(Math.abs(m))); });
  h += ligne('<b>Net viré</b>', '<b>' + euro(r.net) + '</b>') + `</div>`;
  if (rempl) h += `<p class="hint">Un relevé existe déjà pour ce mois : il sera remplacé par ces chiffres.</p>`;
  h += `<div class="actions"><button class="btn ghost grow" id="rlAnnul">Annuler</button>
    <button class="btn primary grow" id="rlOk">${rempl ? 'Remplacer et enregistrer' : 'Enregistrer'}</button></div>`;
  ouvrirSheet(h);
  $('#rlAnnul').onclick = fermerSheet;
  $('#rlOk').onclick = () => action('Enregistrement et archivage du PDF…', 'ajouterReleve', {
    logement: id, date: r.date, net: r.net, lignes: r.lignes, frais: r.frais, pdf, remplacer: rempl,
    remarque: 'Lu depuis le PDF'
  }, rempl ? 'Relevé remplacé' : 'Relevé enregistré');
}

/* ================= Bilan ================= */
function graphique(mois) {
  const W = 340, H = 170, padL = 34, padB = 20, padT = 8;
  const max = Math.max(1, ...mois.map((m) => Math.max(m.in, m.out)));
  const pas = max > 2000 ? 1000 : max > 800 ? 500 : max > 300 ? 200 : 100;
  const top = Math.ceil(max / pas) * pas;
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const cw = (W - padL) / 12, bw = Math.max(4, Math.min(10, cw / 2 - 3));
  const r = 2;
  const barre = (x, v, cls) => {
    if (v <= 0) return '';
    const yy = y(v), hh = H - padB - yy;
    const rr = Math.min(r, hh);
    return `<path class="${cls}" d="M${x},${H - padB} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + bw - rr} Q${x + bw},${yy} ${x + bw},${yy + rr} V${H - padB} Z"/>`;
  };
  let g = '';
  for (let v = 0; v <= top; v += pas) {
    g += `<line class="gl" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('fr-FR') + ' k' : v}</text>`;
  }
  mois.forEach((m, i) => {
    const cx = padL + cw * i + cw / 2;
    g += barre(cx - bw - 1, m.in, 'b-in') + barre(cx + 1, m.out, 'b-out');
    g += `<text class="ax" x="${cx}" y="${H - 6}" text-anchor="middle">${MOIS_COURT[i].charAt(0).toUpperCase()}</text>`;
    g += `<rect class="hit" data-i="${i}" x="${padL + cw * i}" y="${padT}" width="${cw}" height="${H - padT - padB}" rx="4"/>`;
  });
  return `<div class="chart-wrap" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Loyers encaissés et dépenses par mois">${g}</svg><div class="tip" hidden></div></div>`;
}

function brancherGraphique(mois) {
  const wrap = $('#chart'); if (!wrap) return;
  const tip = wrap.querySelector('.tip');
  const montrer = (rect) => {
    wrap.querySelectorAll('.hit.on').forEach((r) => r.classList.remove('on'));
    rect.classList.add('on');
    const m = mois[Number(rect.dataset.i)];
    tip.innerHTML = `<b>${cap(MOIS[m.i])}</b><span><i style="background:var(--chart-in)"></i>Encaissé ${euro(m.in)}</span><br><span><i style="background:var(--chart-out)"></i>Dépenses ${euro(m.out)}</span>`;
    const wr = wrap.getBoundingClientRect(), rr = rect.getBoundingClientRect();
    let x = rr.left - wr.left + rr.width / 2;
    x = Math.max(70, Math.min(wr.width - 70, x));
    tip.style.left = x + 'px'; tip.style.top = (rr.top - wr.top + 4) + 'px';
    tip.hidden = false;
  };
  wrap.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('pointerenter', () => montrer(r));
    r.addEventListener('click', (e) => { e.stopPropagation(); montrer(r); });
  });
  wrap.addEventListener('pointerleave', () => { tip.hidden = true; wrap.querySelectorAll('.hit.on').forEach((r) => r.classList.remove('on')); });
}

function vueBilan() {
  setTitre('Revenus et dépenses', 'Bilan');
  const annees = anneesDisponibles();
  if (!S.bilanAnnee || !annees.includes(S.bilanAnnee)) S.bilanAnnee = annees[0];
  const a = S.bilanAnnee;
  const b = bilan(a, S.bilanLog);

  let h = `<div class="year-chips">${annees.map((y) => `<button class="chip ${y === a ? 'on' : ''}" data-act="bilanAnnee" data-v="${y}">${y}</button>`).join('')}</div>`;
  h += `<div class="chips">${[['tout', 'Tous les logements'], ...logements().map((l) => [l.id, l.libelle])].map(([k, v]) =>
    `<button class="chip ${S.bilanLog === k ? 'on' : ''}" data-act="bilanLog" data-v="${k}">${k !== 'tout' ? `<span class="log-dot" style="--lc:${couleur(k)}"></span>` : ''}${esc(v)}</button>`).join('')}</div>`;

  h += `<div class="kpis k4">
    <div class="kpi"><div class="k-label">Loyers encaissés</div><div class="k-value">${euro0(b.totalIn)}</div><div class="k-sub">${b.nbMois} mois</div></div>
    <div class="kpi"><div class="k-label">Dépenses</div><div class="k-value">${euro0(b.totalOut)}</div><div class="k-sub">${b.dep.length} écriture${b.dep.length > 1 ? 's' : ''}</div></div>
    <div class="kpi"><div class="k-label">Résultat net</div><div class="k-value">${euro0(b.net)}</div><div class="k-sub">encaissé − dépenses</div></div>
    <div class="kpi"><div class="k-label">Ponctualité</div><div class="k-value">${b.ponctualite === null ? '—' : b.ponctualite + ' %'}</div><div class="k-sub">${b.nbPonct ? 'payés avant l\'échéance' : 'pas encore de données'}</div></div>
  </div>`;

  h += `<div class="card chart-card"><div class="chart-head"><h2>Par mois</h2>
      <div class="legend"><span><i style="background:var(--chart-in)"></i>Encaissé</span><span><i style="background:var(--chart-out)"></i>Dépenses</span></div></div>
    ${graphique(b.mois)}
    <details class="plain"><summary>Voir le tableau</summary>
      <table class="data"><thead><tr><th>Mois</th><th>Encaissé</th><th>Dépenses</th><th>Net</th></tr></thead><tbody>
      ${b.mois.map((m) => `<tr><td>${cap(MOIS[m.i])}</td><td>${euro(m.in)}</td><td>${euro(m.out)}</td><td>${euro(m.in - m.out)}</td></tr>`).join('')}
      <tr><th>Total</th><th>${euro(b.totalIn)}</th><th>${euro(b.totalOut)}</th><th>${euro(b.net)}</th></tr></tbody></table>
    </details></div>`;

  h += vueDeclaration();

  // Dépenses
  const cats = Object.entries(b.parCat).sort((x, y) => y[1] - x[1]);
  h += `<p class="section-title">Dépenses ${a}</p><div class="card">`;
  if (cats.length) {
    const maxc = cats[0][1];
    h += cats.map(([c, v]) => `<div class="bar-row"><div class="top"><span>${esc(c)}</span><b>${euro(v)}</b></div><div class="track"><div class="fill" style="width:${Math.max(3, 100 * v / maxc)}%"></div></div></div>`).join('');
  } else h += `<p class="empty" style="padding:10px">Aucune dépense enregistrée</p>`;
  h += `<div class="actions"><button class="btn primary block" data-act="ajouterDepense">+ Ajouter une dépense</button></div></div>`;
  if (b.dep.length) {
    h += `<div class="list" style="margin-top:14px">` + [...b.dep].sort((x, y) => y.date.localeCompare(x.date)).map((d) => {
      const lib = d.logement === 'commun' ? 'Les deux' : logement(d.logement)?.libelle || d.logement;
      return `<button class="row" data-act="voirDepense" data-v="${esc(d.id)}">
        <div class="ico st-idle"><span class="log-dot" style="--lc:${couleur(d.logement)};margin:0"></span></div>
        <div class="grow"><div class="title">${esc(d.libelle || d.categorie)}</div><div class="meta">${esc(fmtJour(parseIso(d.date)))} · ${esc(d.categorie)} · ${esc(lib)}</div></div>
        <b>${euro(d.montant)}</b></button>`;
    }).join('') + `</div>`;
  }
  if (S.bilanLog !== 'tout') h += `<p class="note">Les dépenses communes aux deux logements n'apparaissent que dans « Tous les logements ».</p>`;

  $('#vue').innerHTML = h;
  brancherGraphique(b.mois);
}

function ouvrirDepense(d) {
  const edit = !!d;
  const v = d || { date: isoJour(maintenant()), logement: logements().find((l) => P()[l.id + '.quittance_active'])?.id || 'commun', categorie: CATEGORIES[0], libelle: '', montant: '', remarque: '' };
  if (edit) {
    ouvrirSheet(`<h3>${esc(d.libelle || d.categorie)}</h3><p class="sub">${esc(fmtJour(parseIso(d.date)))} ${esc(d.date.slice(0, 4))}</p>
      <div class="card" style="padding:4px 16px">
        <div class="line-item"><span class="label">Montant</span><span class="value">${euro(d.montant)}</span></div>
        <div class="line-item"><span class="label">Catégorie</span><span class="value">${esc(d.categorie)}</span></div>
        <div class="line-item"><span class="label">Logement</span><span class="value">${esc(d.logement === 'commun' ? 'Les deux' : logement(d.logement)?.libelle || d.logement)}</span></div>
        ${d.remarque ? `<div class="line-item"><span class="label">Remarque</span><span class="value">${esc(d.remarque)}</span></div>` : ''}
      </div>
      <button class="btn danger block" id="dSuppr">Supprimer cette dépense</button>`);
    $('#dSuppr').onclick = async () => {
      if (!await confirmer('Supprimer la dépense ?', `${d.libelle || d.categorie} · ${euro(d.montant)}`, 'Supprimer', true)) return;
      action('Suppression…', 'supprimerDepense', { id: d.id }, 'Dépense supprimée');
    };
    return;
  }
  ouvrirSheet(`<h3>Nouvelle dépense</h3><p class="sub">Elle sera enregistrée dans l'onglet « Dépenses » du tableur.</p>
    <div class="grid2">
      <label class="field"><span>Montant (€)</span><input class="input" id="dMontant" inputmode="decimal" placeholder="0,00"></label>
      <label class="field"><span>Date</span><input class="input" type="date" id="dDate" value="${v.date}"></label>
    </div>
    <label class="field"><span>Catégorie</span><select class="input" id="dCat">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
    <label class="field"><span>Logement</span><select class="input" id="dLog">${logements().map((l) => `<option value="${l.id}" ${l.id === v.logement ? 'selected' : ''}>${esc(l.libelle)}</option>`).join('')}<option value="commun">Les deux</option></select></label>
    <label class="field"><span>Libellé</span><input class="input" id="dLib" placeholder="ex. Taxe foncière 2026"></label>
    <label class="field"><span>Remarque (facultatif)</span><input class="input" id="dRem"></label>
    <button class="btn primary block" id="dOk">Enregistrer</button>`);
  $('#dOk').onclick = () => {
    const montant = num($('#dMontant').value);
    if (!(montant > 0)) return toast('Montant invalide', true);
    if (!$('#dDate').value) return toast('Date manquante', true);
    action('Enregistrement…', 'ajouterDepense', {
      logement: $('#dLog').value, date: $('#dDate').value, categorie: $('#dCat').value,
      libelle: $('#dLib').value.trim(), montant: montant.toFixed(2), remarque: $('#dRem').value.trim()
    }, 'Dépense enregistrée');
  };
}

/* ================= Déclaration des revenus fonciers ================= */
// Lignes de la déclaration 2044 alimentées par les catégories de dépenses
const LIGNES_2044 = [
  { n: '221', lib: 'Frais d\'administration et de gestion', cats: ['Honoraires d\'agence', 'Frais de gestion'] },
  { n: '222', lib: 'Autres frais de gestion (forfait 20 € par logement)', forfait: true },
  { n: '223', lib: 'Primes d\'assurance', cats: ['Assurance loyers impayés (GLI)', 'Assurance propriétaire (PNO)'] },
  { n: '224', lib: 'Travaux de réparation, d\'entretien et d\'amélioration', cats: ['Travaux & entretien'] },
  { n: '227', lib: 'Taxe foncière (hors taxe d\'ordures ménagères)', cats: ['Taxe foncière'] },
  { n: '229', lib: 'Provisions pour charges de copropriété', cats: ['Charges de copropriété'] },
  { n: '250', lib: 'Intérêts d\'emprunt', cats: ['Intérêts d\'emprunt'] }
];

// Revenus fonciers d'une année civile, selon la date d'encaissement (année de réception du loyer)
function declaration(annee) {
  const logs = logements().map((l) => l.id);
  const vide = () => Object.fromEntries(logs.map((id) => [id, 0]));
  const mois = Array.from({ length: 12 }, (_, i) => ({ i, brut: 0, charges: 0, frais: 0 }));
  const loyers = vide(), charges = vide(), recu = vide();
  let estime = false;
  encaissements().forEach((e) => {
    const m = /^\d{4}-\d{2}/.test(e.date_reception || '') ? e.date_reception.slice(0, 7) : e.periode;
    if (!m.startsWith(annee) || !(e.logement in loyers)) return;
    let ch = e.charges;
    if (ch === null || ch === undefined) { ch = logement(e.logement)?.charges || 0; estime = true; }
    ch = Math.min(ch, e.montant);
    loyers[e.logement] += e.montant - ch; charges[e.logement] += ch; recu[e.logement] = 1;
    const mo = mois[Number(m.slice(5, 7)) - 1]; mo.brut += e.montant - ch; mo.charges += ch;
  });
  const dep = (S.data.depenses || []).filter((d) => d.date.startsWith(annee));
  const lignes = LIGNES_2044.map((L) => {
    const v = vide();
    if (L.forfait) logs.forEach((id) => { if (recu[id]) v[id] = 20; });
    else dep.filter((d) => L.cats.includes(d.categorie)).forEach((d) => {
      if (d.logement === 'commun') logs.forEach((id) => { v[id] += d.montant / logs.length; });
      else if (d.logement in v) v[d.logement] += d.montant;
      mois[Number(d.date.slice(5, 7)) - 1].frais += d.montant;
    });
    return { ...L, v, total: logs.reduce((t, id) => t + v[id], 0) };
  });
  mois.forEach((m) => { if (lignes[1].v && m.i === 11) m.frais += lignes[1].total; }); // forfait rattaché à décembre
  const totFrais = vide();
  lignes.forEach((L) => logs.forEach((id) => { totFrais[id] += L.v[id]; }));
  const resultat = Object.fromEntries(logs.map((id) => [id, loyers[id] - totFrais[id]]));
  const somme = (o) => logs.reduce((t, id) => t + o[id], 0);
  const nonClasses = dep.filter((d) => !LIGNES_2044.some((L) => L.cats && L.cats.includes(d.categorie)));
  return { annee, logs, loyers, charges, lignes, totFrais, resultat, mois, estime, nonClasses,
    tot: { loyers: somme(loyers), charges: somme(charges), frais: somme(totFrais), resultat: somme(resultat) } };
}

const URL_COMPTES_IMPOTS = 'https://chrissorbadere.github.io/suivi-cours/#impots';

// Années proposées : celles qui ont des loyers ou des dépenses, jamais dans le futur.
// Par défaut : l'année précédente de janvier à juin (période de déclaration), sinon l'année en cours.
function anneesDeclaration() {
  const auj = new Date(), courante = String(auj.getFullYear());
  const set = new Set();
  encaissements().forEach((e) => set.add(((/^\d{4}/.test(e.date_reception || '') ? e.date_reception : e.periode) || '').slice(0, 4)));
  (S.data.depenses || []).forEach((x) => set.add(String(x.date).slice(0, 4)));
  const liste = [...set].filter((y) => /^\d{4}$/.test(y) && y <= courante).sort().reverse();
  const defaut = auj.getMonth() < 6 && liste.includes(String(auj.getFullYear() - 1)) ? String(auj.getFullYear() - 1) : liste[0];
  if (!S.declAnnee || !liste.includes(S.declAnnee)) S.declAnnee = defaut;
  return liste.slice(0, 6);
}

function vueDeclaration() {
  const annees = anneesDeclaration();
  const a = S.declAnnee;
  if (!a) return '';
  const d = declaration(a);
  const libL = (id) => esc(logement(id)?.libelle || id);
  const ligne = (n, lib, o, total, fort) => `<div class="line-item decl-l${fort ? ' fort' : ''}"><span class="label">${n ? `<b>${n}</b> ` : ''}${esc(lib)}
      <small>${d.logs.map((id) => `${libL(id)} ${euro(o[id])}`).join(' · ')}</small></span><span class="value">${euro(total)}</span></div>`;
  const res = d.tot.resultat;
  let h = `<p class="section-title decl-titre">Déclaration ${Number(a) + 1} · revenus fonciers ${a}</p>
  <div class="card decl-carte">
    <div class="year-chips" style="margin-bottom:12px">${annees.map((y) => `<button class="chip ${y === a ? 'on' : ''}" data-act="declAnnee" data-v="${y}">${y}</button>`).join('')}</div>
    <div class="decl-resultat">
      <span class="lbl">${res >= 0 ? 'Résultat foncier à reporter · 2042, case 4BA' : 'Déficit foncier · voir notice 2044 (4BB / 4BC)'}</span>
      <span class="mt">${euro(Math.abs(res))}</span>
      <span class="sous">${d.logs.map((id) => `${libL(id)} ${euro(d.resultat[id])}`).join(' · ')}</span>
    </div>
    <p class="hint">Formulaire 2044, régime réel. Loyers comptés à leur date d'encaissement, hors charges récupérées.</p>
    ${ligne('211', 'Loyers bruts encaissés', d.loyers, d.tot.loyers)}`;
  d.lignes.forEach((L) => {
    if (!L.total && !['221', '222', '223', '224', '227'].includes(L.n)) return;
    h += ligne(L.n, L.lib, L.v, L.total);
  });
  h += `${ligne('240', 'Total des frais et charges', d.totFrais, d.tot.frais, true)}
    <div class="line-item"><span class="label">Charges récupérées auprès des locataires (non déclarées)</span><span class="value">${euro(d.tot.charges)}</span></div>
    <details class="plain"><summary>Mois par mois</summary>
      <table class="data"><thead><tr><th>Mois</th><th>Loyers HC</th><th>Charges</th><th>Frais</th><th>Résultat</th></tr></thead><tbody>
      ${d.mois.map((m) => `<tr><td>${cap(MOIS[m.i])}</td><td>${euro(m.brut)}</td><td>${euro(m.charges)}</td><td>${euro(m.frais)}</td><td>${euro(m.brut - m.frais)}</td></tr>`).join('')}
      <tr><th>Total</th><th>${euro(d.tot.loyers)}</th><th>${euro(d.tot.charges)}</th><th>${euro(d.tot.frais)}</th><th>${euro(d.tot.resultat)}</th></tr></tbody></table>
    </details>
    <a class="btn block decl-lien" href="${URL_COMPTES_IMPOTS}" target="_blank" rel="noopener">Voir l'onglet Impôts dans Comptes</a>
    <p class="hint" style="text-align:center;margin-top:6px">Salaires, revenus en expatriation et revenus du conjoint</p>
    <div class="actions"><button class="btn ghost grow" data-act="exportDeclCsv">Export CSV</button><button class="btn ghost grow" data-act="exportDeclPdf">Export PDF</button></div>
    <p class="note">${d.tot.loyers + d.tot.charges > 15000 ? 'Loyers bruts supérieurs à 15 000 € : le régime réel (2044) s\'applique. ' : 'Loyers bruts inférieurs à 15 000 € : le micro-foncier (abattement de 30 %) est aussi possible. '}`
    + `Taxe foncière : saisis-la sans la taxe d'ordures ménagères. Dépenses communes réparties à parts égales entre les logements. Le forfait de 20 € est compté en décembre.`
    + `${d.estime ? ' Certains mois viennent de l\'historique du tableur : leurs charges sont estimées.' : ''}`
    + `${d.nonClasses.length ? ` ${d.nonClasses.length} dépense(s) en catégorie « Autre » non comptée(s) : vérifie si elles sont déductibles.` : ''}`
    + ` Document d'aide, à vérifier avec la notice ou un conseiller.</p>
  </div>`;
  return h;
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url; lien.download = nom;
  document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function tableauxDeclaration(d) {
  const f = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  const lib = (id) => logement(id)?.libelle || id;
  const tete = ['Ligne 2044', ...d.logs.map(lib), 'Total'];
  const rows = [['211 - Loyers bruts encaissés', ...d.logs.map((id) => f(d.loyers[id])), f(d.tot.loyers)]];
  d.lignes.forEach((L) => { if (L.total || ['221', '222', '223', '224', '227'].includes(L.n)) rows.push([L.n + ' - ' + L.lib, ...d.logs.map((id) => f(L.v[id])), f(L.total)]); });
  rows.push(['240 - Total des frais et charges', ...d.logs.map((id) => f(d.totFrais[id])), f(d.tot.frais)]);
  rows.push(['Résultat foncier', ...d.logs.map((id) => f(d.resultat[id])), f(d.tot.resultat)]);
  const mt = ['Mois', 'Loyers HC', 'Charges récupérées', 'Frais déductibles', 'Résultat'];
  const mr = d.mois.map((m) => [cap(MOIS[m.i]), f(m.brut), f(m.charges), f(m.frais), f(m.brut - m.frais)]);
  mr.push(['Total', f(d.tot.loyers), f(d.tot.charges), f(d.tot.frais), f(d.tot.resultat)]);
  return { tete, rows, mt, mr, f };
}

function exporterDeclCsv() {
  const d = declaration(S.declAnnee);
  const t = tableauxDeclaration(d);
  const lignes = [['Revenus fonciers ' + d.annee + ' (déclaration ' + (Number(d.annee) + 1) + ')'], [], t.tete, ...t.rows, [],
    [d.tot.resultat >= 0 ? 'Bénéfice foncier (2042 case 4BA)' : 'Déficit foncier', '', '', t.f(Math.abs(d.tot.resultat))], [], t.mt, ...t.mr, [],
    ['Dépenses détaillées'], ['Date', 'Logement', 'Catégorie', 'Libellé', 'Montant']];
  (S.data.depenses || []).filter((x) => x.date.startsWith(d.annee)).sort((x, y) => x.date.localeCompare(y.date)).forEach((x) =>
    lignes.push([x.date, x.logement === 'commun' ? 'Les deux' : logement(x.logement)?.libelle || x.logement, x.categorie, x.libelle, t.f(x.montant)]));
  const csv = '﻿' + lignes.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  telecharger(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `revenus-fonciers-${d.annee}.csv`);
  toast('Fichier CSV téléchargé');
}

function chargerScript(src) {
  return new Promise((ok, ko) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Impossible de charger le module PDF (connexion ?)'));
    document.head.appendChild(s);
  });
}

async function exporterDeclPdf() {
  chargement(true, 'Création du PDF…');
  try {
    await chargerScript('lib/jspdf.umd.min.js');
    await chargerScript('lib/jspdf.plugin.autotable.min.js');
    const d = declaration(S.declAnnee);
    const t = tableauxDeclaration(d);
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const net = (x) => String(x).replace(/[  ]/g, ' ');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16);
    pdf.text(net('Revenus fonciers ' + d.annee), 14, 18);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(90);
    pdf.text(net('Déclaration ' + (Number(d.annee) + 1) + ' · formulaire 2044 (régime réel) · édité le ' + new Date().toLocaleDateString('fr-FR')), 14, 25);
    pdf.setTextColor(0);
    const style = { font: 'helvetica', fontSize: 9.5, cellPadding: 2 };
    const droite = Object.fromEntries(t.tete.map((_, i) => [i, { halign: i ? 'right' : 'left' }]));
    pdf.autoTable({ startY: 31, head: [t.tete], body: t.rows, styles: style, headStyles: { fillColor: [31, 107, 87] }, columnStyles: droite,
      didParseCell: (c) => { if (c.section === 'body' && c.row.index >= t.rows.length - 2) c.cell.styles.fontStyle = 'bold'; } });
    let y = pdf.lastAutoTable.finalY + 8;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
    pdf.text(net((d.tot.resultat >= 0 ? 'Bénéfice foncier à reporter (2042, case 4BA) : ' : 'Déficit foncier : ') + euro(Math.abs(d.tot.resultat))), 14, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
    pdf.text(net('Charges récupérées auprès des locataires (non déclarées) : ' + euro(d.tot.charges)), 14, y + 6);
    pdf.autoTable({ startY: y + 12, head: [t.mt], body: t.mr, styles: style, headStyles: { fillColor: [31, 107, 87] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (c) => { if (c.section === 'body' && c.row.index === t.mr.length - 1) c.cell.styles.fontStyle = 'bold'; } });
    const dep = (S.data.depenses || []).filter((x) => x.date.startsWith(d.annee)).sort((x, z) => x.date.localeCompare(z.date));
    if (dep.length) {
      pdf.autoTable({ startY: pdf.lastAutoTable.finalY + 8, head: [['Date', 'Logement', 'Catégorie', 'Libellé', 'Montant']],
        body: dep.map((x) => [x.date.split('-').reverse().join('/'), x.logement === 'commun' ? 'Les deux' : logement(x.logement)?.libelle || x.logement, x.categorie, x.libelle, t.f(x.montant)]),
        styles: style, headStyles: { fillColor: [120, 120, 120] }, columnStyles: { 4: { halign: 'right' } } });
    }
    y = pdf.lastAutoTable.finalY + 8;
    pdf.setFontSize(8); pdf.setTextColor(110);
    pdf.text(pdf.splitTextToSize('Loyers comptés à leur date d\'encaissement, hors charges récupérées. Dépenses communes réparties à parts égales. Taxe foncière hors taxe d\'ordures ménagères. Document d\'aide établi par l\'application Mes Locations, à vérifier avec la notice 2044.', 182), 14, Math.min(y, 285));
    telecharger(pdf.output('blob'), `revenus-fonciers-${d.annee}.pdf`);
    toast('PDF téléchargé');
  } catch (e) { toast(e.message, true); } finally { chargement(false); }
}

function exporterCsv() {
  const a = S.bilanAnnee;
  const b = bilan(a, S.bilanLog);
  const lignes = [['Type', 'Date / période', 'Logement', 'Catégorie', 'Libellé', 'Montant']];
  [...b.enc].sort((x, y) => x.periode.localeCompare(y.periode)).forEach((e) =>
    lignes.push(['Loyer', e.periode, logement(e.logement)?.libelle || e.logement, 'Loyer encaissé', e.source === 'historique' ? 'historique tableur' : (e.date_reception || ''), e.montant.toFixed(2).replace('.', ',')]));
  [...b.dep].sort((x, y) => x.date.localeCompare(y.date)).forEach((d) =>
    lignes.push(['Dépense', d.date, d.logement === 'commun' ? 'Les deux' : logement(d.logement)?.libelle || d.logement, d.categorie, d.libelle, (-d.montant).toFixed(2).replace('.', ',')]));
  lignes.push([], ['Total encaissé', '', '', '', '', b.totalIn.toFixed(2).replace('.', ',')], ['Total dépenses', '', '', '', '', b.totalOut.toFixed(2).replace('.', ',')], ['Résultat net', '', '', '', '', b.net.toFixed(2).replace('.', ',')]);
  const csv = '﻿' + lignes.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const lien = document.createElement('a');
  lien.href = url; lien.download = `bilan-locations-${a}${S.bilanLog !== 'tout' ? '-' + S.bilanLog : ''}.csv`;
  document.body.appendChild(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Fichier CSV téléchargé');
}

/* ================= Historique ================= */
function vueHistorique() {
  setTitre('Documents et emails envoyés', 'Historique');
  const typeDe = (n) => /rappel loyer/i.test(n) ? 'rappel' : /assurance/i.test(n) ? 'assurance' : 'quittance';
  const logDe = (n) => {
    const t = n.toUpperCase();
    for (const l of logements()) {
      if (t.includes(l.libelle.toUpperCase()) || (l.nom && t.includes(l.nom.toUpperCase()))) return l.id;
    }
    return 'autre';
  };
  let items = S.data.journal.map((j) => ({ ...j, type: typeDe(j.nom), log: logDe(j.nom) }));
  if (S.filtreType !== 'tout') items = items.filter((i) => i.type === S.filtreType);
  if (S.filtreLog !== 'tout') items = items.filter((i) => i.log === S.filtreLog);

  let h = `<div class="chips">
    ${[['tout', 'Tout'], ['quittance', 'Quittances'], ['assurance', 'Assurances'], ['rappel', 'Rappels']].map(([k, v]) => `<button class="chip ${S.filtreType === k ? 'on' : ''}" data-act="filtreType" data-v="${k}">${v}</button>`).join('')}
  </div><div class="chips">
    ${[['tout', 'Tous'], ...logements().map((l) => [l.id, l.libelle])].map(([k, v]) => `<button class="chip ${S.filtreLog === k ? 'on' : ''}" data-act="filtreLog" data-v="${k}">${k !== 'tout' ? `<span class="log-dot" style="--lc:${couleur(k)}"></span>` : ''}${esc(v)}</button>`).join('')}
  </div>`;

  if (!items.length) { $('#vue').innerHTML = h + '<p class="empty">Aucun document</p>'; return; }

  const ICO = { quittance: ['st-info', '€'], assurance: ['st-warn', '☂'], rappel: ['st-danger', '✉'] };
  let annee = '';
  h += items.map((i, idx) => {
    const y = i.date.slice(0, 4);
    let sep = '';
    if (y !== annee) { sep = (idx ? '</div>' : '') + `<p class="section-title">${esc(y)}</p><div class="list">`; annee = y; }
    const d = parseIso(i.date);
    const nom = i.nom.replace(/^-\s*\d{4}-\d{2}-\d{2}\s*:\s*/, '');
    const quand = d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : i.date;
    const [cls, ico] = ICO[i.type];
    const inner = `<div class="ico ${cls}">${ico}</div>
      <div class="grow"><div class="title">${esc(nom)}</div><div class="meta">${esc(quand)}</div></div>`;
    return sep + (i.url && i.url !== '#' ? `<a class="row" href="${esc(i.url)}" target="_blank" rel="noopener">${inner}<span class="chev">↗</span></a>` : `<div class="row" style="cursor:default">${inner}</div>`);
  }).join('') + '</div>';
  $('#vue').innerHTML = h;
}

/* ================= Réglages ================= */
function initDraft() {
  if (S.draft) return;
  S.draft = { ...P() };
  logements().forEach((l) => { S.draft['email:' + l.id] = l.email; });
}
const sw = (key, label, small) => `<div class="toggle-row"><div class="txt"><strong>${esc(label)}</strong>${small ? `<small>${esc(small)}</small>` : ''}</div>
  <label class="switch"><input type="checkbox" data-key="${key}" ${S.draft[key] ? 'checked' : ''}><span></span></label></div>`;
const inp = (key, label, type = 'text', extra = '') => `<label class="field"><span>${esc(label)}</span><input class="input" type="${type}" data-key="${key}" value="${esc(S.draft[key])}" ${extra}></label>`;
const sel = (key, label, options) => `<label class="field"><span>${esc(label)}</span><select class="input" data-key="${key}" data-num="1">
  ${options.map(([v, t]) => `<option value="${v}" ${Number(S.draft[key]) === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const VARS = ['{civilite}', '{prenom}', '{nom}', '{mois}', '{annee}', '{adresse}', '{commune}', '{montant}', '{signature}'];

function theme() { return lireLS(LS_THEME) || 'auto'; }
function appliquerTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const sombre = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => m.setAttribute('content', sombre ? '#121311' : '#F4F1EA'));
}

function vueReglages() {
  setTitre('Paramétrage', 'Réglages');
  initDraft();
  const y = maintenant().getFullYear();
  const jours = Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)]);
  const heures = Array.from({ length: 24 }, (_, i) => [i, i + ' h']);
  const mois = MOIS.map((m, i) => [i + 1, cap(m)]);

  let h = `<p class="section-title">Affichage</p><div class="card"><div class="segmented theme-seg" style="margin:0">
    ${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, v]) => `<button data-act="theme" data-v="${k}" class="${theme() === k ? 'on' : ''}">${v}</button>`).join('')}
  </div></div>`;

  h += `<p class="section-title">Logements</p>`;
  logements().forEach((l) => {
    const recue = String(P()[l.id + '.assurance_recue']) === String(y);
    const ag = String(S.draft[l.id + '.gestion'] || '').toLowerCase() === 'agence';
    h += `<details class="card log" style="--lc:${couleur(l.id)}"${S.ouvert === l.id ? ' open' : ''}><summary><div><h2>${esc(l.libelle)}</h2><p class="sub">${ag ? 'Géré par ' + esc(S.draft[l.id + '.agence_nom'] || 'une agence') : esc([l.prenom, l.nom].join(' ').trim())}</p></div></summary>
      <p class="field" style="margin-bottom:6px"><span style="display:block;font-size:13.5px;color:var(--muted);font-weight:600;margin:0 0 6px 2px">Mode de gestion</span></p>
      <div class="segmented">
        <button data-act="gestion" data-log="${l.id}" data-v="directe" class="${ag ? '' : 'on'}">Directe</button>
        <button data-act="gestion" data-log="${l.id}" data-v="agence" class="${ag ? 'on' : ''}">Par une agence</button>
      </div>
      ${ag ? `${inp(l.id + '.agence_nom', 'Nom de l\'agence')}
        <p class="hint">L'agence encaisse le loyer, envoie les quittances et gère l'assurance : l'application n'envoie rien au locataire.</p>
        ${sw('releve_auto', 'Import automatique des relevés', 'Lit le compte rendu de gestion reçu par email et l\'enregistre')}
        <div style="margin-top:12px">${inp('releve_expediteur', 'Expéditeur des relevés (adresse ou domaine)', 'text', 'autocomplete="off"')}</div>
        ${P().releve_derniere_lecture ? `<p class="hint">Dernière lecture : ${esc(P().releve_derniere_lecture)}</p>` : ''}
        <div class="actions"><button class="btn ghost block" data-act="chercherReleves">Chercher un relevé maintenant</button></div>
    </details>` : ''}
      <div style="margin-bottom:10px${ag ? ';display:none' : ''}">
        ${sw(l.id + '.quittance_active', 'Envoi des quittances', 'Automatique chaque mois, après validation du paiement')}
        ${sw(l.id + '.rappel_impaye', 'Rappel si loyer impayé', 'Email courtois au locataire ' + (S.draft.rappel_impaye_jours || 5) + ' j après l\'échéance')}
        ${sw(l.id + '.assurance_active', 'Demande d\'attestation d\'assurance', 'Une fois par an, avec relances')}
      </div>
      ${inp('email:' + l.id, 'Email du locataire', 'email', 'autocomplete="off"')}
      ${inp(l.id + '.email2', 'Email secondaire (en copie)', 'email', 'placeholder="facultatif"')}
      ${inp(l.id + '.adresse', 'Adresse du bien')}
      ${inp(l.id + '.commune', 'Commune')}
      <div class="card" style="padding:4px 16px;box-shadow:none">
        <div class="toggle-row"><div class="txt"><strong>Attestation ${y} reçue</strong><small>Stoppe les relances pour cette année</small></div>
          <label class="switch"><input type="checkbox" data-act="recue" data-log="${l.id}" ${recue ? 'checked' : ''}><span></span></label></div>
      </div>
      <div class="actions">
        <button class="btn ghost grow" data-act="apercuA" data-log="${l.id}">Aperçu</button>
        <button class="btn ghost grow" data-act="envoyerA" data-log="${l.id}">Demander l'attestation</button>
        <button class="btn ghost grow" data-act="envoyerA" data-log="${l.id}" data-relance="1">Relancer</button>
      </div>
    </details>`;
    if (ag) h = h.slice(0, h.lastIndexOf('<div style="margin-bottom:10px;display:none">'));
  });

  h += `<p class="section-title">Calendrier</p><div class="card">
    <div class="grid2">${sel('quittance_jour', 'Jour des quittances', jours)}${sel('quittance_heure', 'Heure d\'envoi', heures)}</div>
    <p class="hint">C'est aussi la date d'échéance du loyer. Si le mois est plus court, l'envoi a lieu le dernier jour.</p>
    ${sw('envoi_a_la_validation', 'Envoi dès la validation', 'Si la date d\'envoi est déjà passée, envoyer la quittance tout de suite')}
    <div style="margin-top:12px">${inp('rappel_impaye_jours', 'Rappel de loyer impayé après (jours)', 'number', 'min="1" max="60" inputmode="numeric" data-num="1"')}</div>
    <div class="grid2">${sel('assurance_jour', 'Jour de la demande d\'assurance', jours)}${sel('assurance_mois', 'Mois', mois)}</div>
    ${sw('relance_active', 'Relances d\'attestation automatiques', 'Tant que l\'attestation n\'est pas marquée reçue')}
    <div style="margin-top:12px">${inp('relance_jours', 'Délai entre relances (jours)', 'number', 'min="1" max="90" inputmode="numeric" data-num="1"')}</div>
  </div>`;

  h += `<p class="section-title">Emails</p><div class="card">
    ${inp('copie_cachee', 'Copie cachée de chaque envoi', 'email')}
    ${inp('signature', 'Signature')}
  </div>`;

  h += `<p class="section-title">Notifications par email</p><div class="card">
    ${sw('alertes_actives', 'Recevoir les notifications', 'Interrupteur général des emails envoyés à toi')}
    <div style="margin-top:12px">${inp('email_alertes', 'Adresse de réception', 'email')}</div>
    ${sw('notif_loyer', 'Loyer à valider', 'Le jour de l\'échéance, avec un bouton pour valider')}
    <div style="margin-top:12px">${inp('notif_loyer_rappel_jours', 'Rappel si toujours pas validé après (jours, 0 = jamais)', 'number', 'min="0" max="30" inputmode="numeric" data-num="1"')}</div>
    ${sw('notif_attestation', 'Attestation à confirmer', 'Te demande si l\'attestation d\'assurance est arrivée')}
    <div style="margin-top:12px">${inp('notif_attestation_jours', 'Délai après la demande, puis entre deux emails (jours)', 'number', 'min="1" max="60" inputmode="numeric" data-num="1"')}</div>
    ${sw('notif_quittance_bloquee', 'Quittance bloquée', 'Paiement validé mais quittance non envoyée')}
    ${sw('notif_actions', 'Actions à faire', 'Un email dès qu\'une nouvelle action apparaît (au plus un par jour)')}
    ${sw('recap_mensuel', 'Récapitulatif mensuel', 'Le 1er du mois : loyers du mois écoulé et actions en attente')}
    <p class="hint" style="margin-top:12px">Les erreurs d'envoi sont toujours signalées (une fois par erreur).</p>
    <div class="actions"><button class="btn ghost block" data-act="testNotif">Recevoir un exemple de notification</button></div>
  </div>`;

  h += `<p class="section-title">Appli Comptes</p><div class="card">
    ${sw('comptes_sync', 'Envoyer le total des loyers', 'Ligne « Loyers France » de Comptes : net reçu chaque mois (agence + loyers en direct)')}
    ${P().comptes_derniere_sync ? `<p class="hint">Dernière mise à jour : ${esc(P().comptes_derniere_sync)}</p>` : ''}
    <div class="actions"><button class="btn ghost block" data-act="syncComptes">Mettre à jour Comptes maintenant</button></div>
  </div>`;

  h += `<p class="section-title">Modèles d'email</p>`;
  [['quittance', 'Quittance'], ['rappel_loyer', 'Rappel de loyer impayé'], ['assurance', 'Demande d\'assurance'], ['relance', 'Relance assurance']].forEach(([k, t]) => {
    h += `<details class="card"><summary><h2 style="font-size:17px">${esc(t)}</h2></summary>
      ${inp('objet_' + k, 'Objet')}
      <label class="field"><span>Texte</span><textarea class="input" data-key="corps_${k}" id="ta_${k}">${esc(S.draft['corps_' + k])}</textarea></label>
      <div class="var-chips">${VARS.map((v) => `<button data-act="insVar" data-ta="ta_${k}" data-v="${v}">${v}</button>`).join('')}</div>
    </details>`;
  });

  h += `<p class="section-title">Connexion</p><div class="card">
    <div class="line-item"><span class="label">Mode</span><span class="value">${S.cfg.demo ? 'Démo' : 'Connecté à Google Sheets'}</span></div>
    ${!S.cfg.demo ? `<div class="line-item"><span class="label">Serveur</span><span class="value" style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.cfg.url.replace(/^https:\/\//, ''))}</span></div>` : ''}
    <div class="actions">
      <button class="btn ghost grow" data-act="test">Email de test</button>
      <button class="btn danger grow" data-act="deconnexion">${S.cfg.demo ? 'Quitter la démo' : 'Se déconnecter'}</button>
    </div>
  </div>
  <p class="empty" style="padding:12px">Mes Locations · v${VERSION}</p>`;

  $('#vue').innerHTML = h;
  majSavebar();
}

function majSavebar() {
  const existe = document.querySelector('.savebar');
  if (S.dirty && !existe && S.tab === 'reglages') {
    const d = document.createElement('div');
    d.className = 'savebar';
    d.innerHTML = `<span>Non enregistré</span><div style="display:flex;gap:8px">
      <button class="btn ghost" data-act="annulerDraft">Annuler</button><button class="btn primary" data-act="sauver">Enregistrer</button></div>`;
    $('#vue').appendChild(d);
  }
}

async function sauverReglages() {
  const valeurs = {}, emails = {};
  Object.keys(S.draft).forEach((k) => {
    if (k.startsWith('email:')) {
      const id = k.slice(6);
      if (S.draft[k] !== logement(id).email) emails[id] = S.draft[k];
    } else if (S.draft[k] !== P()[k]) valeurs[k] = S.draft[k];
  });
  if (!(Number(S.draft.relance_jours) >= 1) || !(Number(S.draft.rappel_impaye_jours) >= 1) ||
      !(Number(S.draft.notif_loyer_rappel_jours) >= 0) || !(Number(S.draft.notif_attestation_jours) >= 1)) return toast('Délai invalide', true);
  const mails = [S.draft.copie_cachee, S.draft.email_alertes, ...logements().map((l) => S.draft['email:' + l.id]), ...logements().map((l) => S.draft[l.id + '.email2'])];
  if (mails.some((m) => m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(m).trim()))) return toast('Une adresse email est invalide', true);
  S.dirty = false;
  S.draft = null;
  await action('Enregistrement…', 'parametres', { valeurs, emails }, 'Réglages enregistrés');
}

/* ================= Onboarding ================= */
function rendreOnboarding() {
  setTitre('', '');
  $('#vue').innerHTML = `<div class="onboard">
    <img class="logo" src="icon-192.png" alt="">
    <h2>Mes Locations</h2>
    <p>Quittances, paiements, dépenses et attestations d'assurance de tes logements, depuis ton téléphone.</p>
    <ol class="steps">
      <li>Dans Google Sheets, exécute la fonction <b>installer</b> du script.</li>
      <li>Déploie le script en <b>Application Web</b> et copie l'URL.</li>
      <li>Colle l'URL et le code secret ci-dessous.</li>
    </ol>
    <label class="field"><span>URL de l'application Web</span><input class="input" id="oUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
    <label class="field"><span>Code secret</span><input class="input" id="oToken" autocomplete="off" autocapitalize="off"></label>
    <button class="btn primary block" id="oGo">Se connecter</button>
    <button class="btn ghost block" id="oDemo" style="margin-top:10px">Découvrir en mode démo</button>
  </div>`;
  $('#oGo').onclick = async () => {
    const url = $('#oUrl').value.trim(), token = $('#oToken').value.trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return toast('URL invalide : elle doit finir par /exec', true);
    if (!token) return toast('Code secret manquant', true);
    S.cfg = { url, token };
    chargement(true, 'Connexion…');
    try {
      S.data = normaliser(await api('etat'));
      ecrireLS(LS_CFG, S.cfg); ecrireLS(LS_CACHE, S.data);
      S.tab = 'accueil'; rendre(); toast('Connecté');
    } catch (e) { S.cfg = null; toast(e.message, true); } finally { chargement(false); }
  };
  $('#oDemo').onclick = () => { S.cfg = { demo: true }; S.data = null; S.tab = 'accueil'; rendre(); charger(); };
}

function rendreErreurConnexion(msg) {
  $('#vue').innerHTML = `<div class="card"><h2>Connexion impossible</h2><p class="sub">${esc(msg)}</p>
    <div class="actions"><button class="btn primary grow" data-act="reessayer">Réessayer</button>
    <button class="btn ghost grow" data-act="deconnexion">Changer de connexion</button></div></div>`;
}

/* ================= Événements ================= */
function changerOnglet(tab) { S.tab = tab; window.scrollTo(0, 0); rendre(); }

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act], .tabbar button');
  if (!t) return;
  if (t.closest('.tabbar')) return changerOnglet(t.dataset.tab);
  if (t.matches('.switch input')) return; // géré par « change »
  e.stopPropagation();
  const { act, log, per } = t.dataset;
  switch (act) {
    case 'tab': changerOnglet(t.dataset.tab); break;
    case 'paiement': ouvrirPaiement(log, per); break;
    case 'payeRapide': payeRapide(log, per); break;
    case 'logPaiements': S.logPaiements = log; rendre(); break;
    case 'filtreType': S.filtreType = t.dataset.v; rendre(); break;
    case 'filtreLog': S.filtreLog = t.dataset.v; rendre(); break;
    case 'bilanAnnee': S.bilanAnnee = t.dataset.v; rendre(); break;
    case 'declAnnee': S.declAnnee = t.dataset.v; rendre(); break;
    case 'bilanLog': S.bilanLog = t.dataset.v; rendre(); break;
    case 'ajouterDepense': ouvrirDepense(null); break;
    case 'voirLogement': S.logPaiements = log; changerOnglet('paiements'); break;
    case 'voirReleve': { const r = (S.data.releves || []).find((x) => x.id === t.dataset.v); if (r) ouvrirReleve(r); break; }
    case 'ajouterReleve': ouvrirReleve(null, log, per); break;
    case 'syncComptes':
      action('Mise à jour de Comptes…', 'synchroniserComptes', {}, 'Comptes est à jour');
      break;
    case 'chercherReleves': {
      chargement(true, 'Recherche dans ta boîte mail…');
      try {
        const r = await api('importerRelevesEmail');
        await charger(true);
        toast(cap(r.resultat || 'terminé'));
      } catch (err) { toast(err.message, true); } finally { chargement(false); }
      break;
    }
    case 'gestion':
      if (!S.draft) return;
      S.draft[log + '.gestion'] = t.dataset.v;
      if (t.dataset.v === 'agence') { S.draft[log + '.quittance_active'] = false; S.draft[log + '.assurance_active'] = false; S.draft[log + '.rappel_impaye'] = false; }
      S.ouvert = log; S.dirty = true; rendre();
      break;
    case 'voirDepense': ouvrirDepense(S.data.depenses.find((d) => d.id === t.dataset.v)); break;
    case 'exportCsv': exporterCsv(); break;
    case 'exportDeclCsv': exporterDeclCsv(); break;
    case 'exportDeclPdf': exporterDeclPdf(); break;
    case 'theme': ecrireLS(LS_THEME, t.dataset.v); appliquerTheme(t.dataset.v); rendre(); break;
    case 'envoyerQ': {
      const l = logement(log), p = paiement(log, per);
      if (!await confirmer(p?.quittance_le ? 'Renvoyer la quittance ?' : 'Envoyer la quittance ?',
        `Quittance ${de(moisDe(per))}${labelPeriode(per)} à ${l.email || '(adresse manquante)'}.`, 'Envoyer')) return;
      action('Envoi de la quittance…', 'envoyerQuittance', { logement: log, periode: per }, 'Quittance envoyée');
      break;
    }
    case 'rappelLoyer': {
      const l = logement(log);
      if (!await confirmer('Envoyer un rappel de paiement ?', `Email courtois à ${l.email || '(adresse manquante)'} pour le loyer ${de(moisDe(per))}${labelPeriode(per)}.`, 'Envoyer le rappel')) return;
      action('Envoi du rappel…', 'rappelLoyer', { logement: log, periode: per }, 'Rappel envoyé');
      break;
    }
    case 'annulerP':
      if (!await confirmer('Annuler la validation ?', 'Le paiement repassera « à valider ».', 'Annuler la validation', true)) return;
      action('Annulation…', 'annulerPaiement', { logement: log, periode: per }, 'Validation annulée');
      break;
    case 'envoyerA': {
      const rel = !!t.dataset.relance, l = logement(log);
      if (S.dirty) return toast('Enregistre d\'abord tes réglages', true);
      if (!await confirmer(rel ? 'Envoyer une relance ?' : 'Demander l\'attestation ?', `Email à ${l.email || '(adresse manquante)'}.`, 'Envoyer')) return;
      action('Envoi…', 'envoyerAssurance', { logement: log, relance: rel }, rel ? 'Relance envoyée' : 'Demande envoyée');
      break;
    }
    case 'recueBtn': {
      const y = maintenant().getFullYear();
      if (!await confirmer('Attestation ' + y + ' reçue ?', 'Les relances automatiques s\'arrêtent pour cette année.', 'Confirmer')) return;
      action('Enregistrement…', 'assuranceRecue', { logement: log, recue: true }, 'Attestation marquée reçue');
      break;
    }
    case 'apercuQ': case 'apercuA': {
      chargement(true, 'Génération de l\'aperçu…');
      try {
        const r = await api('apercu', { logement: log, periode: per, type: act === 'apercuA' ? 'assurance' : 'quittance' });
        const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
        window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
      } catch (err) { toast(err.message, true); } finally { chargement(false); }
      break;
    }
    case 'effacerErreur': action('…', 'effacerErreur', {}, 'Erreur effacée'); break;
    case 'insVar': {
      const ta = document.getElementById(t.dataset.ta);
      const s = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, s) + t.dataset.v + ta.value.slice(ta.selectionEnd ?? s);
      ta.focus(); ta.selectionStart = ta.selectionEnd = s + t.dataset.v.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      break;
    }
    case 'sauver': sauverReglages(); break;
    case 'annulerDraft': S.draft = null; S.dirty = false; rendre(); break;
    case 'testNotif':
      if (S.dirty) return toast('Enregistre d\'abord tes réglages', true);
      chargement(true, 'Envoi de l\'exemple…');
      try { await api('testNotification'); toast('Exemple envoyé à ' + (P().email_alertes || 'ton adresse')); } catch (err) { toast(err.message, true); } finally { chargement(false); }
      break;
    case 'test':
      chargement(true, 'Envoi du test…');
      try { await api('test'); toast('Email de test envoyé'); } catch (err) { toast(err.message, true); } finally { chargement(false); }
      break;
    case 'deconnexion':
      if (!await confirmer(S.cfg.demo ? 'Quitter la démo ?' : 'Se déconnecter ?', 'Tu pourras te reconnecter avec l\'URL et le code secret.', 'Confirmer', true)) return;
      localStorage.removeItem(LS_CFG); localStorage.removeItem(LS_CACHE);
      S.cfg = null; S.data = null; S.draft = null; S.dirty = false; rendre();
      break;
    case 'reessayer': charger(); break;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.act === 'recue') {
    action('Enregistrement…', 'assuranceRecue', { logement: t.dataset.log, recue: t.checked }, t.checked ? 'Attestation marquée reçue' : 'Attestation marquée non reçue');
    return;
  }
  if (t.dataset.key) majDraft(t);
});
document.addEventListener('input', (e) => { if (e.target.dataset.key && e.target.type !== 'checkbox') majDraft(e.target); });
function majDraft(t) {
  if (!S.draft) return;
  S.draft[t.dataset.key] = t.type === 'checkbox' ? t.checked : t.dataset.num ? Number(t.value) : t.value;
  S.dirty = true; majSavebar();
}

$('#btnRefresh').onclick = () => charger();
$('#sheetBackdrop').onclick = fermerSheet;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.cfg && !S.dirty) charger(true); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => appliquerTheme(theme()));

// Tirer pour actualiser
(() => {
  const ptr = $('#ptr');
  let y0 = null, dy = 0;
  window.addEventListener('touchstart', (e) => { y0 = (window.scrollY <= 0 && $('#sheet').hidden && S.data) ? e.touches[0].clientY : null; dy = 0; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    ptr.style.transform = `translate(-50%, ${Math.min(dy, 110) - 60}px) rotate(${dy * 2}deg)`;
  }, { passive: true });
  window.addEventListener('touchend', async () => {
    if (y0 === null) return;
    y0 = null;
    if (dy > 80) {
      ptr.classList.add('go'); ptr.style.transform = 'translate(-50%, 30px)';
      vibrer(15);
      await charger();
      ptr.classList.remove('go');
    }
    ptr.style.transform = '';
  });
})();

/* ================= Mode démo ================= */
let DEMO = null;
function initDemo() {
  const n = new Date();
  const cur = periodeDe(n);
  const y = n.getFullYear();
  const params = {
    copie_cachee: 'chris.soulas@gmail.com', signature: 'Christophe SOULAS', email_alertes: 'chris.soulas@gmail.com', alertes_actives: true,
    quittance_jour: 10, quittance_heure: 12, envoi_a_la_validation: true, assurance_jour: 4, assurance_mois: 1, relance_active: true, relance_jours: 15,
    rappel_impaye_jours: 5, notif_loyer: true, notif_loyer_rappel_jours: 3, notif_attestation: true, notif_attestation_jours: 7,
    notif_quittance_bloquee: true, notif_actions: true, recap_mensuel: true, app_url: 'https://chrissorbadere.github.io/Loyers/index.html',
    objet_quittance: 'Quittance de loyer - {mois} {annee} - {adresse}',
    corps_quittance: 'Bonjour {civilite} {nom},\n\nVoici la quittance de loyer du mois de {mois} {annee} pour votre location du :\n\n{adresse}\n{commune}\n\nVous souhaitant bonne réception.\nBien cordialement.\n{signature}',
    objet_rappel_loyer: 'Rappel : loyer de {mois} {annee} - {adresse}',
    corps_rappel_loyer: 'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu le loyer de {mois} {annee} ({montant}).\n\nBien cordialement.\n{signature}',
    objet_assurance: 'Attestation d\'assurance {annee} - {adresse}',
    corps_assurance: 'Bonjour {civilite} {nom},\n\nJe vous prie de bien vouloir me renvoyer l\'attestation d\'assurance pour la location du :\n\n{adresse}\n{commune}\n\nBien cordialement.\n{signature}',
    objet_relance: 'Rappel : attestation d\'assurance {annee} - {adresse}',
    corps_relance: 'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu votre attestation d\'assurance {annee}.\n\nBien cordialement.\n{signature}',
    'maison.gestion': 'agence', 'maison.agence_nom': 'Agence (Villenave-d\'Ornon)', releve_auto: true, releve_expediteur: 'laforet.com',
    releve_derniere_lecture: '20/11/2026 — importé : novembre 2026', comptes_sync: true,
    comptes_derniere_sync: '20/11/2026 22:15 — 2026-11 : 1 560,26 €',
    'trianon.gestion': 'directe', 'trianon.agence_nom': '',
    'maison.quittance_active': false, 'maison.assurance_active': false, 'maison.rappel_impaye': false, 'maison.email2': '', 'maison.adresse': '5 route du chemin Large', 'maison.commune': 'à St Sulpice et Cameyrac.',
    'maison.assurance_envoyee': '', 'maison.derniere_relance': '', 'maison.assurance_recue': '', 'maison.alerte_periode': '', 'maison.rappel_periode': '',
    'trianon.quittance_active': true, 'trianon.assurance_active': true, 'trianon.rappel_impaye': true, 'trianon.email2': '', 'trianon.adresse': '5 Bis route du chemin Large', 'trianon.commune': 'à St Sulpice et Cameyrac.',
    'trianon.assurance_envoyee': y + '-01-04', 'trianon.derniere_relance': y + '-01-19', 'trianon.assurance_recue': '', 'trianon.alerte_periode': '', 'trianon.rappel_periode': '',
    derniere_erreur: ''
  };
  const paiements = [], journal = [], historique = [];
  for (let i = 11; i >= 1; i--) {
    const per = dePeriode(cur, -i);
    const jr = [4, 6, 9, 12, 5][i % 5];
    const d = per + '-' + String(jr).padStart(2, '0'), q = per + '-10 12:24';
    paiements.push({ logement: 'trianon', periode: per, montant: '419.71', date_reception: d, valide_le: d + ' 09:12', quittance_le: q, pdf: '#', remarque: 'Virement' });
    journal.unshift({ date: per + '-10 / 12:24:45', url: '#', nom: '- ' + per + '-10 : TRIANON Quittance ' + labelPeriode(per) + ' SUDRE Gilles' });
  }
  for (let m = 1; m <= 12; m++) {
    historique.push({ date: (y - 1) + '-' + String(m).padStart(2, '0') + '-10', maison: m <= 12 ? 650 : 0, trianon: 412.5 });
  }
  journal.push({ date: y + '-01-04 / 12:05:12', url: '#', nom: '- ' + y + '-01-04 : TRIANON Assurance location SUDRE Gilles' });
  journal.sort((a, b) => b.date.localeCompare(a.date));
  const depenses = [
    { id: 'd1', date: y + '-09-15', logement: 'commun', categorie: 'Taxe foncière', libelle: 'Taxe foncière ' + y, montant: 1240, remarque: '' },
    { id: 'd2', date: y + '-03-02', logement: 'trianon', categorie: 'Assurance propriétaire (PNO)', libelle: 'Assurance PNO', montant: 142, remarque: '' },
    { id: 'd3', date: y + '-06-21', logement: 'trianon', categorie: 'Travaux & entretien', libelle: 'Entretien chaudière', montant: 118, remarque: '' },
    { id: 'd4', date: (y - 1) + '-09-15', logement: 'commun', categorie: 'Taxe foncière', libelle: 'Taxe foncière ' + (y - 1), montant: 1198, remarque: '' }
  ];
  DEMO = {
    params, paiements, journal, depenses, historique, releves: [],
    logements: [
      { id: 'maison', libelle: 'Maison', civilite: 'Mme', prenom: 'Emilie', nom: 'LEURS', email: 'locataire.maison@example.com', loyer: 0, charges: 0 },
      { id: 'trianon', libelle: 'Trianon', civilite: 'M.', prenom: 'Gilles', nom: 'SUDRE', email: 'locataire.trianon@example.com', loyer: 419.71, charges: 5.51 }
    ]
  };
}
function demoReleve(p) {
  if (DEMO.releves.some((r) => r.logement === p.logement && r.date === p.date)) throw new Error('Un relevé du ' + p.date + ' existe déjà pour ce logement');
  const id = 'R' + Math.random().toString(16).slice(2, 9);
  const dd = p.date.split('-').reverse().join('/');
  let loyers = 0, prov = 0, frais = 0;
  p.lignes.forEach((l) => { loyers += Number(l.loyer); prov += Number(l.provisions || 0); });
  p.frais.forEach((f) => { frais += Number(f.montant); });
  DEMO.releves.push({ id, logement: p.logement, date: p.date, periodes: p.lignes.map((l) => l.periode).join(', '), loyers, provisions: prov, frais, net: Math.round((loyers + prov - frais) * 100) / 100, pdf: p.pdf ? '#' : '', remarque: p.remarque || '' });
  p.lignes.forEach((l) => {
    DEMO.paiements = DEMO.paiements.filter((x) => !(x.logement === p.logement && x.periode === l.periode));
    DEMO.paiements.push({ logement: p.logement, periode: l.periode, montant: (Number(l.loyer) + Number(l.provisions || 0)).toFixed(2), date_reception: p.date, valide_le: p.date + ' 10:00', quittance_le: 'agence', pdf: p.pdf ? '#' : '', remarque: 'Relevé agence du ' + dd + ' [' + id + ']', charges: String(l.provisions || 0) });
  });
  p.frais.forEach((f, i) => DEMO.depenses.push({ id: id + '-' + (i + 1), date: f.date || p.date, logement: p.logement, categorie: f.categorie, libelle: f.libelle, montant: Number(f.montant), remarque: 'Relevé agence du ' + dd }));
}
function demoSeedAgence() {
  const gli = { categorie: 'Assurance loyers impayés (GLI)', libelle: 'Cotisation garantie des loyers impayés 2026', montant: 31.32 };
  demoReleve({ logement: 'maison', date: '2026-08-20', lignes: [{ periode: '2026-07', loyer: 556.45, provisions: 4.84 }, { periode: '2026-08', loyer: 1150, provisions: 10 }],
    frais: [gli, { categorie: 'Honoraires d\'agence', libelle: 'Mise en location (EDL + bail − avoir)', montant: 350 }, { categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion', montant: 103.27 }] });
  ['2026-09-21', '2026-10-20'].forEach((d) => demoReleve({ logement: 'maison', date: d, lignes: [{ periode: d.slice(0, 7), loyer: 1150, provisions: 10 }],
    frais: [gli, { categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion', montant: 69.60 }] }));
}
function demoEtat() { return JSON.parse(JSON.stringify({ ...DEMO, maintenant: isoJour(new Date()) + 'T' + new Date().toTimeString().slice(0, 8) })); }
function demoNow() { const d = new Date(); return isoJour(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
async function demoApi(act, p) {
  if (!DEMO) { initDemo(); demoSeedAgence(); }
  await new Promise((r) => setTimeout(r, act === 'etat' ? 250 : 600));
  const trouve = () => DEMO.paiements.find((x) => x.logement === p.logement && x.periode === p.periode);
  const lg = () => DEMO.logements.find((y) => y.id === p.logement);
  const journaliser = (nom) => DEMO.journal.unshift({ date: demoNow().replace(' ', ' / ') + ':00', url: '#', nom: '- ' + isoJour(new Date()) + ' : ' + nom });
  const envoyerQ = () => {
    const x = trouve(); if (!x?.valide_le) throw new Error('Paiement non validé');
    x.quittance_le = demoNow(); x.pdf = '#';
    journaliser(lg().libelle.toUpperCase() + ' Quittance ' + labelPeriode(p.periode) + ' ' + lg().nom + ' ' + lg().prenom);
  };
  switch (act) {
    case 'etat': break;
    case 'parametres':
      Object.assign(DEMO.params, p.valeurs || {});
      Object.entries(p.emails || {}).forEach(([id, m]) => { DEMO.logements.find((l) => l.id === id).email = m; });
      break;
    case 'validerPaiement': {
      let x = trouve();
      if (!x) { x = { logement: p.logement, periode: p.periode }; DEMO.paiements.push(x); }
      Object.assign(x, { montant: p.montant, date_reception: p.date, valide_le: demoNow(), quittance_le: '', pdf: '', remarque: p.remarque });
      if (p.envoyer) envoyerQ();
      break;
    }
    case 'annulerPaiement': { const x = trouve(); if (x?.quittance_le) throw new Error('Quittance déjà envoyée'); DEMO.paiements = DEMO.paiements.filter((y) => y !== x); break; }
    case 'envoyerQuittance': envoyerQ(); break;
    case 'rappelLoyer':
      DEMO.params[p.logement + '.rappel_periode'] = p.periode;
      journaliser(lg().libelle.toUpperCase() + ' Rappel loyer ' + labelPeriode(p.periode) + ' ' + lg().nom + ' ' + lg().prenom);
      DEMO.journal[0].url = '';
      break;
    case 'envoyerAssurance':
      if (p.relance) DEMO.params[p.logement + '.derniere_relance'] = isoJour(new Date());
      else { DEMO.params[p.logement + '.assurance_envoyee'] = isoJour(new Date()); DEMO.params[p.logement + '.assurance_recue'] = ''; }
      journaliser(lg().libelle.toUpperCase() + (p.relance ? ' Relance assurance ' : ' Assurance location ') + lg().nom + ' ' + lg().prenom);
      break;
    case 'assuranceRecue': DEMO.params[p.logement + '.assurance_recue'] = p.recue ? String(new Date().getFullYear()) : ''; break;
    case 'ajouterDepense':
      DEMO.depenses.push({ id: 'd' + Date.now(), date: p.date, logement: p.logement, categorie: p.categorie, libelle: p.libelle, montant: Number(p.montant), remarque: p.remarque });
      break;
    case 'ajouterReleve':
      if (p.remplacer) DEMO.releves.filter((r) => r.logement === p.logement && p.lignes.some((l) => r.periodes.split(', ').includes(l.periode))).forEach((r) => {
        DEMO.releves = DEMO.releves.filter((x) => x !== r);
        DEMO.depenses = DEMO.depenses.filter((d) => !d.id.startsWith(r.id + '-'));
        DEMO.paiements = DEMO.paiements.filter((x) => !String(x.remarque).includes('[' + r.id + ']'));
      });
      demoReleve(p); break;
    case 'analyserReleve': {
      const r = { date: '2026-11-20', net: '1140.55', lignes: [{ periode: '2026-11', loyer: '1150.00', provisions: '99.23', detail: 'Régularisation 89,23 €' }],
        frais: [{ categorie: 'Assurance loyers impayés (GLI)', libelle: 'Cotisation garantie des loyers impayés', montant: '33.73' },
          { categorie: 'Honoraires d\'agence', libelle: 'Honoraires de gestion', montant: '74.95' }] };
      r.existants = DEMO.releves.filter((x) => x.logement === p.logement && x.periodes.includes('2026-11')).map((x) => x.id);
      return r;
    }
    case 'synchroniserComptes': break;
    case 'importerRelevesEmail': return { resultat: 'démo : aucun nouveau relevé' };
    case 'joindrePdfReleve': { const r = DEMO.releves.find((x) => x.id === p.id); if (r) r.pdf = '#'; break; }
    case 'supprimerReleve':
      DEMO.releves = DEMO.releves.filter((r) => r.id !== p.id);
      DEMO.paiements = DEMO.paiements.filter((x) => !String(x.remarque).includes('[' + p.id + ']'));
      DEMO.depenses = DEMO.depenses.filter((d) => !d.id.startsWith(p.id + '-'));
      break;
    case 'supprimerDepense': DEMO.depenses = DEMO.depenses.filter((d) => d.id !== p.id); break;
    case 'effacerErreur': DEMO.params.derniere_erreur = ''; break;
    case 'apercu': throw new Error('Aperçu PDF indisponible en mode démo');
    case 'test': case 'testNotification': return { envoye: true };
  }
  return demoEtat();
}

/* ================= Liens profonds (depuis les emails) ================= */
// #paiement/<logement>/<aaaa-mm> · #attestation/<logement> · #accueil · #paiements · #bilan · #historique · #reglages
let lienEnAttente = null;
function lireLien() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return;
  lienEnAttente = h;
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignoré */ }
  traiterLien();
}
async function traiterLien() {
  if (!lienEnAttente || !S.cfg || !S.data) return;
  const [vue, id, per] = lienEnAttente.split('/');
  lienEnAttente = null;
  const valide = (x) => logements().some((l) => l.id === x);
  if (vue === 'paiement' && valide(id) && /^\d{4}-\d{2}$/.test(per || '')) {
    S.tab = 'paiements'; S.logPaiements = id; rendre(); ouvrirPaiement(id, per);
  } else if (vue === 'attestation' && valide(id)) {
    S.tab = 'accueil'; rendre();
    const y = maintenant().getFullYear();
    if (String(P()[id + '.assurance_recue']) === String(y)) return toast('Attestation ' + y + ' déjà confirmée');
    if (await confirmer('Attestation ' + y + ' reçue ?', logement(id).libelle + ' : les relances automatiques s\'arrêteront.', 'Confirmer')) {
      action('Enregistrement…', 'assuranceRecue', { logement: id, recue: true }, 'Attestation marquée reçue');
    }
  } else if (['accueil', 'paiements', 'bilan', 'historique', 'reglages'].includes(vue)) {
    changerOnglet(vue);
  }
}
window.addEventListener('hashchange', lireLien);

/* ================= Démarrage ================= */
appliquerTheme(theme());
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (S.cfg && !S.cfg.demo) { S.data = lireLS(LS_CACHE); if (S.data) normaliser(S.data); }
if (S.cfg?.demo) S.cfg = null; // la démo ne persiste pas
rendre();
lireLien();
if (S.cfg) charger(true);
