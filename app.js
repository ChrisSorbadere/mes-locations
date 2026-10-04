/* Mes Locations — PWA (vanilla JS) */
'use strict';

const VERSION = '1.0.0';
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const LS_CFG = 'ml_cfg', LS_CACHE = 'ml_cache';

const S = {
  cfg: lireLS(LS_CFG) || null,     // {url, token, demo}
  data: null,                      // état renvoyé par l'API
  tab: 'accueil',
  logPaiements: null,
  filtreType: 'tout', filtreLog: 'tout',
  draft: null, dirty: false
};

/* ================= Utilitaires ================= */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const euro = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
function lireLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function ecrireLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

function maintenant() { return S.data?.maintenant ? new Date(S.data.maintenant) : new Date(); }
function periodeDe(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function periodeCourante() { return periodeDe(maintenant()); }
function labelPeriode(p) { return MOIS[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4); }
function moisDe(p) { return MOIS[Number(p.slice(5, 7)) - 1]; }
function dePeriode(p, delta) { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + delta, 1); return periodeDe(d); }
function parseIso(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) : null; }
function fmtJour(d) { return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : ''; }
function fmtJourCourt(d) { return d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''; }
function isoJour(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function de(mot) { return /^[aeiouyhéè]/i.test(mot) ? "d'" : 'de '; }

const P = () => S.data.params;
const logements = () => S.data.logements;
const logement = (id) => logements().find((l) => l.id === id);
const paiement = (id, per) => S.data.paiements.find((p) => p.logement === id && p.periode === per);

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
  if (courant && ech <= maintenant()) return { cls: 'danger', pill: 'À valider', titre: 'Loyer ' + de(moisDe(per)) + moisDe(per) + ' non validé', detail: 'La quittance attend ta validation', p };
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
      const base = rel || env;
      const proch = new Date(base.getTime() + Number(pr.relance_jours) * 86400000);
      detail += ' · relance auto le ' + fmtJourCourt(proch);
    }
    return { cls: 'warn', titre: 'Attestation ' + y + ' en attente', detail };
  }
  return { cls: 'info', titre: 'Prochaine demande d\'attestation', detail: 'le ' + fmtJour(prochaineDemandeAssurance()) };
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

async function charger(silencieux) {
  const btn = $('#btnRefresh');
  btn.classList.add('spin');
  try {
    S.data = await api('etat');
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

async function action(label, nom, payload, succes) {
  chargement(true, label);
  try {
    S.data = await api(nom, payload);
    if (!S.cfg.demo) ecrireLS(LS_CACHE, S.data);
    fermerSheet();
    rendre();
    if (succes) toast(succes);
  } catch (e) {
    toast(e.message, true);
  } finally {
    chargement(false);
  }
}

/* ================= UI de base ================= */
let toastTimer;
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 5000 : 2800);
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

function rendre() {
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  $('#demoBadge').hidden = !S.cfg?.demo;
  $('#tabbar').hidden = !S.cfg;
  $('#btnRefresh').hidden = !S.cfg;
  if (!S.cfg) return rendreOnboarding();
  if (!S.data) { $('#vue').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  ({ accueil: vueAccueil, paiements: vuePaiements, historique: vueHistorique, reglages: vueReglages })[S.tab]();
}

/* ================= Accueil ================= */
function vueAccueil() {
  const n = maintenant();
  setTitre(n.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), 'Bonjour Chris');
  const per = periodeCourante();
  let h = '';

  if (P().derniere_erreur) {
    h += `<div class="banner st-danger"><div class="grow"><strong>Dernière erreur d'envoi</strong><br>${esc(P().derniere_erreur)}</div>
      <button data-act="effacerErreur">Effacer</button></div>`;
  }

  const actifs = logements().filter((l) => P()[l.id + '.quittance_active'] || P()[l.id + '.assurance_active'] || paiement(l.id, per));
  const inactifs = logements().filter((l) => !actifs.includes(l));

  actifs.forEach((l) => {
    const s = statutQuittance(l, per);
    const a = statutAssurance(l);
    const montant = s.p?.montant ? Number(String(s.p.montant).replace(',', '.')) : l.loyer;
    h += `<article class="card">
      <div class="card-head">
        <div><h2>${esc(l.libelle)}</h2><p class="sub">${esc([l.civilite, l.prenom, l.nom].join(' ').trim() || 'Aucun locataire')}</p></div>
        <span class="pill ${s.cls === 'danger' ? 'danger' : s.cls}">${esc(s.pill)}</span>
      </div>
      <p class="amount">${euro(montant)} <small>· ${esc(cap(labelPeriode(per)))}</small></p>
      <div class="status st-${s.cls}"><i class="dot"></i><div><strong>${esc(s.titre)}</strong>${s.detail ? `<span class="small">${esc(s.detail)}</span>` : ''}</div></div>
      <div class="actions">
        ${!s.p?.valide_le
          ? `<button class="btn primary grow" data-act="paiement" data-log="${l.id}" data-per="${per}">Valider le paiement</button>`
          : `<button class="btn ghost grow" data-act="paiement" data-log="${l.id}" data-per="${per}">Détails du paiement</button>`}
        ${s.p?.valide_le && !s.p?.quittance_le ? `<button class="btn primary grow" data-act="envoyerQ" data-log="${l.id}" data-per="${per}">Envoyer la quittance</button>` : ''}
      </div>
      <div class="status st-${a.cls}" style="margin-top:10px"><i class="dot"></i><div><strong>${esc(a.titre)}</strong>${a.detail ? `<span class="small">${esc(a.detail)}</span>` : ''}</div></div>
    </article>`;
  });

  if (inactifs.length) {
    h += `<p class="section-title">Sans envoi actif</p><div class="list">` + inactifs.map((l) =>
      `<button class="row" data-act="tab" data-tab="reglages"><div class="ico st-idle">⌂</div><div class="grow"><div class="title">${esc(l.libelle)}</div>
       <div class="meta">${esc([l.prenom, l.nom].join(' ').trim() || 'Aucun locataire')} · quittances et assurance désactivées</div></div><span class="chev">›</span></button>`).join('') + `</div>`;
  }

  // Échéances
  const ech = dateEcheance(per) > n ? dateEcheance(per) : dateEcheance(dePeriode(per, 1));
  h += `<p class="section-title">Prochaines échéances</p><div class="card">
    <div class="line-item"><span class="label">Quittances</span><span class="value">${esc(fmtJour(ech))} · ${ech.getHours()} h</span></div>
    <div class="line-item"><span class="label">Demande d'attestation</span><span class="value">${esc(fmtJour(prochaineDemandeAssurance()))}</span></div>
    <div class="line-item"><span class="label">Envoi à la validation</span><span class="value">${P().envoi_a_la_validation ? 'Oui, si la date est passée' : 'Non'}</span></div>
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
  const totalAnnee = S.data.paiements.filter((p) => p.logement === l.id && p.periode.startsWith(annee) && p.valide_le)
    .reduce((t, p) => t + (Number(String(p.montant).replace(',', '.')) || 0), 0);
  const nbAnnee = S.data.paiements.filter((p) => p.logement === l.id && p.periode.startsWith(annee) && p.valide_le).length;

  let h = `<div class="segmented">${logements().map((x) => `<button data-act="logPaiements" data-log="${x.id}" class="${x.id === l.id ? 'on' : ''}">${esc(x.libelle)}</button>`).join('')}</div>`;
  h += `<div class="card"><div class="card-head"><div><p class="sub">Encaissé en ${annee}</p><p class="amount" style="margin-top:4px">${euro(totalAnnee)}</p></div>
        <span class="pill info">${nbAnnee} mois validé${nbAnnee > 1 ? 's' : ''}</span></div>
        <p class="sub">Loyer attendu : ${euro(l.loyer)}${l.charges ? ' dont ' + euro(l.charges) + ' de charges' : ''}</p></div>`;
  h += `<div class="list">` + periodes.map((per) => {
    const s = statutQuittance(l, per);
    const ico = s.cls === 'ok' ? '✓' : s.cls === 'info' ? '€' : s.cls === 'danger' || s.cls === 'warn' ? '!' : '·';
    const meta = s.p?.valide_le ? euro(String(s.p.montant).replace(',', '.')) + (s.p.date_reception ? ' · reçu le ' + fmtJourCourt(parseIso(s.p.date_reception)) : '') : s.detail || '—';
    return `<button class="row" data-act="paiement" data-log="${l.id}" data-per="${per}">
      <div class="ico st-${s.cls}">${ico}</div>
      <div class="grow"><div class="title">${esc(cap(labelPeriode(per)))}</div><div class="meta">${esc(meta)}</div></div>
      <span class="pill ${s.cls}">${esc(s.pill)}</span></button>`;
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
    ouvrirSheet(`<h3>${esc(cap(titre))}</h3><p class="sub">${esc(l.libelle)} · ${esc([l.civilite, l.prenom, l.nom].join(' '))}</p>
      <label class="field"><span>Montant reçu (€)</span><input class="input" id="fMontant" inputmode="decimal" value="${esc(String(l.loyer).replace('.', ','))}"></label>
      <label class="field"><span>Date de réception</span><input class="input" type="date" id="fDate" value="${isoJour(maintenant())}"></label>
      <p class="hint">Le jour de réception figurera sur la quittance (« Date du paiement »).</p>
      <label class="field"><span>Remarque (facultatif)</span><input class="input" id="fRem" placeholder="Virement, chèque…"></label>
      <div class="card" style="padding:4px 16px">
        <div class="toggle-row"><div class="txt"><strong>Envoyer la quittance maintenant</strong>
          <small>${echPassee ? 'Sinon, envoi manuel depuis l\'application' : 'Sinon, envoi automatique le ' + esc(fmtJour(dateEcheance(per)))}</small></div>
          <label class="switch"><input type="checkbox" id="fEnvoyer" ${envoyerDefaut ? 'checked' : ''}><span></span></label></div>
      </div>
      <button class="btn primary block" id="fValider">Valider le paiement</button>`);
    $('#fValider').onclick = () => {
      const montant = Number($('#fMontant').value.replace(/\s/g, '').replace(',', '.'));
      if (!(montant > 0)) return toast('Montant invalide', true);
      const envoyer = $('#fEnvoyer').checked;
      action(envoyer ? 'Validation et envoi de la quittance…' : 'Validation…', 'validerPaiement',
        { logement: id, periode: per, montant: montant.toFixed(2), date: $('#fDate').value, remarque: $('#fRem').value.trim(), envoyer },
        envoyer ? 'Paiement validé, quittance envoyée' : 'Paiement validé');
    };
    return;
  }
  const s = statutQuittance(l, per);
  ouvrirSheet(`<h3>${esc(cap(titre))}</h3><p class="sub">${esc(l.libelle)} · ${esc([l.civilite, l.prenom, l.nom].join(' '))}</p>
    <div class="card" style="padding:4px 16px">
      <div class="line-item"><span class="label">Montant</span><span class="value">${euro(String(p.montant).replace(',', '.'))}</span></div>
      <div class="line-item"><span class="label">Reçu le</span><span class="value">${esc(fmtJour(parseIso(p.date_reception)))}</span></div>
      <div class="line-item"><span class="label">Validé le</span><span class="value">${esc(fmtJour(parseIso(p.valide_le)))}</span></div>
      ${p.remarque ? `<div class="line-item"><span class="label">Remarque</span><span class="value">${esc(p.remarque)}</span></div>` : ''}
      <div class="line-item"><span class="label">Quittance</span><span class="value">${p.quittance_le ? 'envoyée le ' + esc(fmtJour(parseIso(p.quittance_le))) : 'non envoyée'}</span></div>
    </div>
    <div class="status st-${s.cls}" style="margin:0 0 14px"><i class="dot"></i><div><strong>${esc(s.titre)}</strong>${s.detail ? `<span class="small">${esc(s.detail)}</span>` : ''}</div></div>
    <div class="actions">
      ${p.pdf ? `<a class="btn ghost grow" href="${esc(p.pdf)}" target="_blank" rel="noopener">Ouvrir le PDF</a>` : ''}
      <button class="btn ghost grow" data-act="apercuQ" data-log="${id}" data-per="${per}">Aperçu</button>
      <button class="btn primary block" data-act="envoyerQ" data-log="${id}" data-per="${per}">${p.quittance_le ? 'Renvoyer la quittance' : 'Envoyer la quittance'}</button>
      ${!p.quittance_le ? `<button class="btn danger block" data-act="annulerP" data-log="${id}" data-per="${per}">Annuler la validation</button>` : ''}
    </div>`);
}

/* ================= Historique ================= */
function vueHistorique() {
  setTitre('Documents envoyés', 'Historique');
  const typeDe = (n) => /assurance/i.test(n) ? 'assurance' : 'quittance';
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
    ${[['tout', 'Tout'], ['quittance', 'Quittances'], ['assurance', 'Assurances']].map(([k, v]) => `<button class="chip ${S.filtreType === k ? 'on' : ''}" data-act="filtreType" data-v="${k}">${v}</button>`).join('')}
    <span style="width:8px;flex:none"></span>
    ${[['tout', 'Tous'], ...logements().map((l) => [l.id, l.libelle])].map(([k, v]) => `<button class="chip ${S.filtreLog === k ? 'on' : ''}" data-act="filtreLog" data-v="${k}">${esc(v)}</button>`).join('')}
  </div>`;

  if (!items.length) { $('#vue').innerHTML = h + '<p class="empty">Aucun document</p>'; return; }

  let annee = '';
  h += items.map((i, idx) => {
    const y = i.date.slice(0, 4);
    let sep = '';
    if (y !== annee) { sep = (idx ? '</div>' : '') + `<p class="section-title">${esc(y)}</p><div class="list">`; annee = y; }
    const d = parseIso(i.date.replace(' / ', ' '));
    const nom = i.nom.replace(/^-\s*\d{4}-\d{2}-\d{2}\s*:\s*/, '');
    return sep + `<a class="row" href="${esc(i.url)}" target="_blank" rel="noopener">
      <div class="ico ${i.type === 'assurance' ? 'st-warn' : 'st-info'}">${i.type === 'assurance' ? '☂' : '€'}</div>
      <div class="grow"><div class="title">${esc(nom)}</div><div class="meta">${esc(d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : i.date)}</div></div>
      <span class="chev">↗</span></a>`;
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

function vueReglages() {
  setTitre('Paramétrage', 'Réglages');
  initDraft();
  const y = maintenant().getFullYear();
  const jours = Array.from({ length: 31 }, (_, i) => [i + 1, String(i + 1)]);
  const heures = Array.from({ length: 24 }, (_, i) => [i, i + ' h']);
  const mois = MOIS.map((m, i) => [i + 1, cap(m)]);

  let h = `<p class="section-title">Logements</p>`;
  logements().forEach((l) => {
    const recue = String(P()[l.id + '.assurance_recue']) === String(y);
    h += `<details class="card"><summary><div><h2>${esc(l.libelle)}</h2><p class="sub">${esc([l.prenom, l.nom].join(' ').trim())}</p></div></summary>
      <div style="margin-bottom:10px">
        ${sw(l.id + '.quittance_active', 'Envoi des quittances', 'Automatique chaque mois, après validation du paiement')}
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
    <p class="hint">Si le mois est plus court, l'envoi a lieu le dernier jour.</p>
    ${sw('envoi_a_la_validation', 'Envoi dès la validation', 'Si la date d\'envoi est déjà passée, proposer l\'envoi immédiat')}
    <div class="grid2" style="margin-top:14px">${sel('assurance_jour', 'Jour de la demande d\'assurance', jours)}${sel('assurance_mois', 'Mois', mois)}</div>
    ${sw('relance_active', 'Relances automatiques', 'Tant que l\'attestation n\'est pas marquée reçue')}
    <div style="margin-top:12px">${inp('relance_jours', 'Délai entre relances (jours)', 'number', 'min="1" max="90" inputmode="numeric" data-num="1"')}</div>
  </div>`;

  h += `<p class="section-title">Emails</p><div class="card">
    ${inp('copie_cachee', 'Copie cachée de chaque envoi', 'email')}
    ${inp('signature', 'Signature')}
    ${sw('alertes_actives', 'Alertes', 'Paiement non validé à l\'échéance, erreurs d\'envoi')}
    <div style="margin-top:12px">${inp('email_alertes', 'Adresse des alertes', 'email')}</div>
  </div>`;

  h += `<p class="section-title">Modèles d'email</p>`;
  [['quittance', 'Quittance'], ['assurance', 'Demande d\'assurance'], ['relance', 'Relance assurance']].forEach(([k, t]) => {
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

  if (S.dirty) h += `<div class="savebar"><span>Non enregistré</span><div style="display:flex;gap:8px">
    <button class="btn ghost" data-act="annulerDraft">Annuler</button><button class="btn primary" data-act="sauver">Enregistrer</button></div></div>`;

  $('#vue').innerHTML = h;
}

function majSavebar() {
  const existe = document.querySelector('.savebar');
  if (S.dirty && !existe) {
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
  const jr = Number(S.draft.relance_jours);
  if (!(jr >= 1)) return toast('Délai de relance invalide', true);
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
    <p>Quittances, paiements et attestations d'assurance de tes logements, depuis ton téléphone.</p>
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
      S.data = await api('etat');
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
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act], .tabbar button');
  if (!t) return;
  if (t.closest('.tabbar')) {
    S.tab = t.dataset.tab; window.scrollTo(0, 0); rendre(); return;
  }
  const { act, log, per } = t.dataset;
  switch (act) {
    case 'tab': S.tab = t.dataset.tab; window.scrollTo(0, 0); rendre(); break;
    case 'paiement': ouvrirPaiement(log, per); break;
    case 'logPaiements': S.logPaiements = log; rendre(); break;
    case 'filtreType': S.filtreType = t.dataset.v; rendre(); break;
    case 'filtreLog': S.filtreLog = t.dataset.v; rendre(); break;
    case 'envoyerQ': {
      const l = logement(log), p = paiement(log, per);
      if (!await confirmer(p?.quittance_le ? 'Renvoyer la quittance ?' : 'Envoyer la quittance ?',
        `Quittance ${de(moisDe(per))}${labelPeriode(per)} à ${l.email || '(adresse manquante)'}.`, 'Envoyer')) return;
      action('Envoi de la quittance…', 'envoyerQuittance', { logement: log, periode: per }, 'Quittance envoyée');
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

/* ================= Mode démo ================= */
let DEMO = null;
function initDemo() {
  const n = new Date();
  const cur = periodeDe(n);
  const params = {
    copie_cachee: 'chris.soulas@gmail.com', signature: 'Christophe SOULAS', email_alertes: 'chris.soulas@gmail.com', alertes_actives: true,
    quittance_jour: 10, quittance_heure: 12, envoi_a_la_validation: true, assurance_jour: 4, assurance_mois: 1, relance_active: true, relance_jours: 15,
    objet_quittance: 'Quittance de loyer - {mois} {annee} - {adresse}',
    corps_quittance: 'Bonjour {civilite} {nom},\n\nVoici la quittance de loyer du mois de {mois} {annee} pour votre location du :\n\n{adresse}\n{commune}\n\nVous souhaitant bonne réception.\nBien cordialement.\n{signature}',
    objet_assurance: 'Attestation d\'assurance {annee} - {adresse}',
    corps_assurance: 'Bonjour {civilite} {nom},\n\nJe vous prie de bien vouloir me renvoyer l\'attestation d\'assurance pour la location du :\n\n{adresse}\n{commune}\n\nBien cordialement.\n{signature}',
    objet_relance: 'Rappel : attestation d\'assurance {annee} - {adresse}',
    corps_relance: 'Bonjour {civilite} {nom},\n\nSauf erreur de ma part, je n\'ai pas encore reçu votre attestation d\'assurance {annee}.\n\nBien cordialement.\n{signature}',
    'maison.quittance_active': false, 'maison.assurance_active': false, 'maison.email2': '', 'maison.adresse': '5 route du chemin Large', 'maison.commune': 'à St Sulpice et Cameyrac.',
    'maison.assurance_envoyee': '', 'maison.derniere_relance': '', 'maison.assurance_recue': '', 'maison.alerte_periode': '',
    'trianon.quittance_active': true, 'trianon.assurance_active': true, 'trianon.email2': '', 'trianon.adresse': '5 Bis route du chemin Large', 'trianon.commune': 'à St Sulpice et Cameyrac.',
    'trianon.assurance_envoyee': n.getFullYear() + '-01-04', 'trianon.derniere_relance': '', 'trianon.assurance_recue': String(n.getFullYear()), 'trianon.alerte_periode': '',
    derniere_erreur: ''
  };
  const paiements = [], journal = [];
  for (let i = 11; i >= 1; i--) {
    const per = dePeriode(cur, -i);
    const d = per + '-06', q = per + '-10 12:24';
    paiements.push({ logement: 'trianon', periode: per, montant: '419.71', date_reception: d, valide_le: per + '-07 09:12', quittance_le: q, pdf: '#', remarque: 'Virement' });
    journal.unshift({ date: per + '-10 / 12:24:45', url: '#', nom: '- ' + per + '-10 : TRIANON Quittance ' + labelPeriode(per) + ' SUDRE Gilles' });
  }
  journal.push({ date: n.getFullYear() + '-01-04 / 12:05:12', url: '#', nom: '- ' + n.getFullYear() + '-01-04 : TRIANON Assurance location SUDRE Gilles' });
  journal.sort((a, b) => b.date.localeCompare(a.date));
  DEMO = {
    params, paiements, journal,
    logements: [
      { id: 'maison', libelle: 'Maison', civilite: 'Mme', prenom: 'Emilie', nom: 'LEURS', email: 'locataire.maison@example.com', loyer: 0, charges: 0 },
      { id: 'trianon', libelle: 'Trianon', civilite: 'M.', prenom: 'Gilles', nom: 'SUDRE', email: 'locataire.trianon@example.com', loyer: 419.71, charges: 5.51 }
    ]
  };
}
function demoEtat() { return JSON.parse(JSON.stringify({ ...DEMO, maintenant: new Date().toISOString().slice(0, 19) })); }
function demoNow() { const d = new Date(); return isoJour(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
async function demoApi(act, p) {
  if (!DEMO) initDemo();
  await new Promise((r) => setTimeout(r, act === 'etat' ? 250 : 650));
  const trouve = () => DEMO.paiements.find((x) => x.logement === p.logement && x.periode === p.periode);
  const envoyerQ = () => {
    const x = trouve(); if (!x?.valide_le) throw new Error('Paiement non validé');
    x.quittance_le = demoNow(); x.pdf = '#';
    const l = DEMO.logements.find((y) => y.id === p.logement);
    DEMO.journal.unshift({ date: demoNow().replace(' ', ' / ') + ':00', url: '#', nom: '- ' + isoJour(new Date()) + ' : ' + l.libelle.toUpperCase() + ' Quittance ' + labelPeriode(p.periode) + ' ' + l.nom + ' ' + l.prenom });
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
    case 'annulerPaiement': DEMO.paiements = DEMO.paiements.filter((x) => x !== trouve()); break;
    case 'envoyerQuittance': envoyerQ(); break;
    case 'envoyerAssurance': {
      const l = DEMO.logements.find((y) => y.id === p.logement);
      if (p.relance) DEMO.params[p.logement + '.derniere_relance'] = isoJour(new Date());
      else { DEMO.params[p.logement + '.assurance_envoyee'] = isoJour(new Date()); DEMO.params[p.logement + '.assurance_recue'] = ''; }
      DEMO.journal.unshift({ date: demoNow().replace(' ', ' / ') + ':00', url: '#', nom: '- ' + isoJour(new Date()) + ' : ' + l.libelle.toUpperCase() + (p.relance ? ' Relance assurance ' : ' Assurance location ') + l.nom + ' ' + l.prenom });
      break;
    }
    case 'assuranceRecue': DEMO.params[p.logement + '.assurance_recue'] = p.recue ? String(new Date().getFullYear()) : ''; break;
    case 'effacerErreur': DEMO.params.derniere_erreur = ''; break;
    case 'apercu': throw new Error('Aperçu PDF indisponible en mode démo');
    case 'test': return { envoye: true };
  }
  return demoEtat();
}

/* ================= Démarrage ================= */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (S.cfg && !S.cfg.demo) S.data = lireLS(LS_CACHE);
if (S.cfg?.demo) S.cfg = null; // la démo ne persiste pas
rendre();
if (S.cfg) charger(true);
