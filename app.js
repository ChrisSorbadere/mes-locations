/* Mes Locations — PWA (vanilla JS) */
'use strict';

const VERSION = '1.1.1';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const CATEGORIES = ['Taxe foncière', 'Assurance propriétaire (PNO)', 'Travaux & entretien', 'Charges de copropriété', 'Frais de gestion', 'Intérêts d\'emprunt', 'Autre'];
const LS_CFG = 'ml_cfg', LS_CACHE = 'ml_cache', LS_THEME = 'ml_theme';

const S = {
  cfg: lireLS(LS_CFG) || null,     // {url, token, demo}
  data: null,                      // état renvoyé par l'API
  tab: 'accueil',
  logPaiements: null,
  filtreType: 'tout', filtreLog: 'tout',
  bilanAnnee: null, bilanLog: 'tout',
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
    m.set(p.logement + '|' + p.periode, { logement: p.logement, periode: p.periode, montant: num(p.montant), date_reception: p.date_reception, source: 'paiement' });
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
  const chargesEstim = enc.reduce((t, e) => t + (logement(e.logement)?.charges || 0), 0);
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
  const n = maintenant();
  const pr = P();
  if (pr.derniere_erreur) {
    t.push({ cls: 'danger', ico: '!', titre: 'Erreur d\'envoi', detail: pr.derniere_erreur,
      actions: [['ghost', 'Effacer', 'effacerErreur', '']] });
  }
  logements().forEach((l) => {
    if (!pr[l.id + '.quittance_active']) return;
    const p = paiement(l.id, per);
    const ech = dateEcheance(per);
    const joursAvant = (ech - n) / 86400000;
    if (!p?.valide_le && joursAvant <= 7) {
      const passe = joursAvant <= 0;
      t.push({ cls: passe ? 'danger' : 'warn', ico: '€', log: l.id,
        titre: `Loyer ${de(moisDe(per))}${moisDe(per)} — ${l.libelle}`,
        detail: `${euro(l.loyer)} · ${passe ? 'échéance passée le ' : 'échéance le '}${fmtJour(ech)}`,
        actions: [['primary', 'Payé ✓', 'payeRapide', per], ['ghost', 'Autre montant', 'paiement', per]]
          .concat(passe ? [['ghost', 'Rappel', 'rappelLoyer', per]] : []) });
    }
    if (p?.valide_le && !p.quittance_le && (per !== periodeCourante() || ech <= n)) {
      t.push({ cls: 'warn', ico: '✉', log: l.id, titre: `Quittance ${de(moisDe(per))}${moisDe(per)} à envoyer — ${l.libelle}`,
        detail: 'Paiement validé, quittance pas encore partie', actions: [['primary', 'Envoyer', 'envoyerQ', per]] });
    }
  });
  logements().forEach((l) => {
    const a = statutAssurance(l);
    if (a.cls === 'warn') {
      t.push({ cls: 'warn', ico: '☂', log: l.id, titre: `${a.titre} — ${l.libelle}`, detail: a.detail,
        actions: [['primary', 'Attestation reçue', 'recueBtn', ''], ['ghost', 'Relancer', 'envoyerA', '', '1']] });
    }
  });
  return t;
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
  h += `<p class="section-title">À faire</p>`;
  if (!taches.length) {
    h += `<div class="todo"><div class="todo-ok"><div class="todo-ico st-ok">✓</div><div class="todo-txt"><strong>Tout est à jour</strong><small>Aucune action requise pour l'instant</small></div></div></div>`;
  } else {
    h += `<div class="todo">` + taches.map((t) => `<div class="todo-item">
      <div class="todo-head"><div class="todo-ico st-${t.cls}">${t.ico}</div>
        <div class="todo-txt"><strong>${t.log ? `<span class="log-dot" style="--lc:${couleur(t.log)}"></span>` : ''}${esc(t.titre)}</strong><small>${esc(t.detail)}</small></div></div>
      <div class="todo-actions">${t.actions.map(([cls, lbl, act, per, rel]) =>
        `<button class="btn ${cls}" data-act="${act}" data-log="${t.log || ''}" data-per="${per}"${rel ? ' data-relance="1"' : ''}>${esc(lbl)}</button>`).join('')}</div>
    </div>`).join('') + `</div>`;
  }

  // Logements
  const actifs = logements().filter((l) => P()[l.id + '.quittance_active'] || P()[l.id + '.assurance_active'] || paiement(l.id, per));
  const inactifs = logements().filter((l) => !actifs.includes(l));
  h += `<p class="section-title">Mes logements</p>`;
  actifs.forEach((l) => {
    const s = statutQuittance(l, per);
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
        <p class="sub">Loyer attendu : ${euro(l.loyer)}${l.charges ? ' dont ' + euro(l.charges) + ' de charges' : ''}</p></div>`;
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

  // Estimation revenus fonciers
  const horsCharges = Math.max(0, b.totalIn - b.chargesEstim);
  h += `<p class="section-title">Revenus fonciers ${a} (estimation)</p><div class="card">
    <div class="line-item"><span class="label">Loyers encaissés (charges comprises)</span><span class="value">${euro(b.totalIn)}</span></div>
    <div class="line-item"><span class="label">Loyers hors charges (estim.)</span><span class="value">${euro(horsCharges)}</span></div>
    <div class="line-item"><span class="label">Micro-foncier : base après abattement 30 %</span><span class="value">${euro(horsCharges * 0.7)}</span></div>
    <div class="line-item"><span class="label">Réel : loyers HC − dépenses</span><span class="value">${euro(horsCharges - b.totalOut)}</span></div>
    <p class="note">Estimation indicative${S.bilanLog !== 'tout' ? ' pour ce logement seul' : ''}. Les charges sont estimées à partir du montant actuel. Le micro-foncier s'applique si les loyers bruts de tous tes biens ne dépassent pas 15 000 €. À vérifier avec ta déclaration ou un conseiller.</p>
    <div class="actions"><button class="btn ghost grow" data-act="exportCsv">Exporter ${a} (CSV)</button></div>
  </div>`;

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
    h += `<details class="card log" style="--lc:${couleur(l.id)}"><summary><div><h2>${esc(l.libelle)}</h2><p class="sub">${esc([l.prenom, l.nom].join(' ').trim())}</p></div></summary>
      <div style="margin-bottom:10px">
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
    ${sw('alertes_actives', 'Alertes', 'Paiement non validé à l\'échéance, erreurs d\'envoi')}
    <div style="margin-top:12px">${inp('email_alertes', 'Adresse des alertes', 'email')}</div>
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
  if (!(Number(S.draft.relance_jours) >= 1) || !(Number(S.draft.rappel_impaye_jours) >= 1)) return toast('Délai invalide', true);
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
    <img class="logo" src="icons/icon.svg" alt="">
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
    case 'bilanLog': S.bilanLog = t.dataset.v; rendre(); break;
    case 'ajouterDepense': ouvrirDepense(null); break;
    case 'voirDepense': ouvrirDepense(S.data.depenses.find((d) => d.id === t.dataset.v)); break;
    case 'exportCsv': exporterCsv(); break;
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
    rappel_impaye_jours: 5,
    objet_quittance: 'Quittance de loyer - {mois} {annee} - {adresse}',
    corps_quittance: 'Bonjour {civilite} {nom},\n\nVoici la quittance de loyer du mois de {mois} {annee} pour votre location du :\n\n{adresse}\n{commune}\n\nVous souhaitant bonne réception.\nBien cordialement.\n{signature}',
    objet_rappel_loyer: 'Rappel : loyer de {mois} {annee} - {adresse}',
    corps_rappel_loyer: 'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu le loyer de {mois} {annee} ({montant}).\n\nBien cordialement.\n{signature}',
    objet_assurance: 'Attestation d\'assurance {annee} - {adresse}',
    corps_assurance: 'Bonjour {civilite} {nom},\n\nJe vous prie de bien vouloir me renvoyer l\'attestation d\'assurance pour la location du :\n\n{adresse}\n{commune}\n\nBien cordialement.\n{signature}',
    objet_relance: 'Rappel : attestation d\'assurance {annee} - {adresse}',
    corps_relance: 'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu votre attestation d\'assurance {annee}.\n\nBien cordialement.\n{signature}',
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
    params, paiements, journal, depenses, historique,
    logements: [
      { id: 'maison', libelle: 'Maison', civilite: 'Mme', prenom: 'Emilie', nom: 'LEURS', email: 'locataire.maison@example.com', loyer: 0, charges: 0 },
      { id: 'trianon', libelle: 'Trianon', civilite: 'M.', prenom: 'Gilles', nom: 'SUDRE', email: 'locataire.trianon@example.com', loyer: 419.71, charges: 5.51 }
    ]
  };
}
function demoEtat() { return JSON.parse(JSON.stringify({ ...DEMO, maintenant: isoJour(new Date()) + 'T' + new Date().toTimeString().slice(0, 8) })); }
function demoNow() { const d = new Date(); return isoJour(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
async function demoApi(act, p) {
  if (!DEMO) initDemo();
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
    case 'supprimerDepense': DEMO.depenses = DEMO.depenses.filter((d) => d.id !== p.id); break;
    case 'effacerErreur': DEMO.params.derniere_erreur = ''; break;
    case 'apercu': throw new Error('Aperçu PDF indisponible en mode démo');
    case 'test': return { envoye: true };
  }
  return demoEtat();
}

/* ================= Démarrage ================= */
appliquerTheme(theme());
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (S.cfg && !S.cfg.demo) { S.data = lireLS(LS_CACHE); if (S.data) normaliser(S.data); }
if (S.cfg?.demo) S.cfg = null; // la démo ne persiste pas
rendre();
if (S.cfg) charger(true);
