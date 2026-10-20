// =====================================================================
//  Rang et statistiques d'un joueur, visibles par tous (ancien afficherRang de JS/profil.js, même HTML)
//  - le rang : le palier de la cote classée (table rangs : 1 000 points au départ, Elo K = 32)
//    et la progression vers le palier suivant ;
//  - les statistiques : stats_joueur, des totaux calculés à partir des duels enregistrés
//    (contre l'Ombre et contre des joueurs) et des cartes possédées.
// =====================================================================
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

// Paliers du classé : [cote minimum, nom] (les mêmes que le duel en ligne et le SQL)
const PALIERS_CLASSE = [[0, 'Bronze'], [1100, 'Argent'], [1250, 'Or'], [1400, 'Platine'], [1550, 'Diamant'], [1700, 'Couronne']];
const COTE_DEPART = 1000;
const LARGEUR_PALIER = 150;   // un palier fait 150 points (Bronze, sans plancher, est mesuré pareil)
const nombreFr = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, mot) => `${nombreFr(n)} ${mot}${n > 1 ? 's' : ''}`;
const taux = (v, d) => (v + d ? `${Math.round((v / (v + d)) * 100)} %` : '—');

function Plaque({ r }) {
  const i = PALIERS_CLASSE.findLastIndex(([min]) => r.cote >= min);
  const [min, nom] = PALIERS_CLASSE[i];
  const suivant = PALIERS_CLASSE[i + 1];
  const bas = suivant ? suivant[0] - LARGEUR_PALIER : min;
  const pct = suivant ? Math.max(0, Math.min(100, Math.round(((r.cote - bas) / (suivant[0] - bas)) * 100))) : 100;
  const parties = r.victoires + r.defaites;
  return (
    <div className={`rang-plaque rang-plaque--${nom.toLowerCase()}`} id="rang-plaque">
      <div className="rang-plaque__haut">
        <span className="rang-plaque__medaillon" id="rang-medaillon" aria-hidden="true">{nom[0]}</span>
        <div className="rang-plaque__titre">
          <span className="rang-plaque__sur">Rang classé</span>
          <strong className="rang-plaque__nom" id="rang-nom">{nom}</strong>
        </div>
        <span className="rang-plaque__cote" id="rang-cote">{nombreFr(r.cote)}<small>points</small></span>
      </div>
      <div className="rang-plaque__jauge" id="rang-jauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}
        aria-label={suivant ? `Progression vers ${suivant[1]} : ${pct} %` : 'Palier le plus haut'}>
        <span id="rang-jauge-remplie" style={{ width: `${pct}%` }} />
      </div>
      <div className="rang-plaque__bornes"><span id="rang-borne-bas">{nom}</span><span id="rang-borne-haut">{suivant ? `${suivant[1]} · ${nombreFr(suivant[0])}` : 'Sommet'}</span></div>
      <p className="rang-plaque__pied" id="rang-pied">
        <span>{suivant ? <>Encore <b>{nombreFr(suivant[0] - r.cote)}</b> points pour {suivant[1]}</> : 'Palier le plus haut atteint'}</span>
        <span>{parties ? `${nombreFr(r.victoires)} V · ${nombreFr(r.defaites)} D · ${taux(r.victoires, r.defaites)}` : 'Aucune partie classée'}</span>
      </p>
    </div>
  );
}

function Statistiques({ stats }) {
  const v = stats.victoires ?? 0;
  const d = stats.defaites ?? 0;
  const pctV = v + d ? Math.round((v / (v + d)) * 100) : 0;
  const ligne = (titre, lv, ld) => (
    <li key={titre}><span className="rang-detail__titre">{titre}</span><span className="rang-detail__points" aria-hidden="true" />
      <span className="rang-detail__valeur">{nombreFr(lv)} V · {nombreFr(ld)} D</span><span className="rang-detail__taux">{taux(lv, ld)}</span></li>
  );
  return (
    <>
      <dl className="rang-chiffres" id="stats-duels">
        {[['Victoires', nombreFr(v)], ['Défaites', nombreFr(d)], ['Taux', taux(v, d)],
          ['Cartes', nombreFr(stats.cartes), stats.exemplaires > stats.cartes ? `${pluriel(stats.exemplaires, 'exemplaire')}, doublons compris` : undefined],
        ].map(([k, val, titre]) => <div key={k} title={titre}><dt>{k}</dt><dd>{val}</dd></div>)}
      </dl>
      <div className="rang-ratio" id="stats-ratio">
        <div className={`rang-ratio__barre${v + d ? '' : ' rang-ratio__barre--vide'}`} role="img" aria-label={`${pctV} % de victoires`}>
          <span style={{ width: `${pctV}%` }} />
        </div>
        <span className="rang-ratio__legende">{v + d ? `${pluriel(v + d, 'duel')} terminé${v + d > 1 ? 's' : ''}` : 'Aucun duel terminé'}</span>
      </div>
      <ul className="rang-detail" id="stats-detail">
        {ligne('Contre l’Ombre', stats.ia_victoires ?? 0, stats.ia_defaites ?? 0)}
        {ligne('Contre des joueurs', stats.joueurs_victoires ?? 0, stats.joueurs_defaites ?? 0)}
      </ul>
    </>
  );
}

export default function Rang({ discordId, estMoi }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let actif = true;
    Promise.all([
      supabase.from('rangs').select('cote, victoires, defaites').eq('discord_id', discordId).maybeSingle(),
      supabase.rpc('stats_joueur', { p_discord_id: discordId }),
    ]).then(([rang, stats]) => { if (actif) setD({ pour: discordId, rang, stats }); });
    return () => { actif = false; };
  }, [discordId]);
  if (!d || d.pour !== discordId) return null;

  const errRang = !!d.rang.error;
  const sansStats = !!d.stats.error || !d.stats.data;
  if (errRang && sansStats && !estMoi) return null;
  const note = [
    errRang ? '' : 'Le rang monte ou descend en partie classée (environ 16 points par partie).',
    sansStats ? '' : 'Les statistiques comptent les duels terminés depuis le Pass de saison, hors mode Histoire et abandons.',
  ].filter(Boolean).join(' ');

  return (
    <section id="rang-profil" className="carte rang-profil">
      <span className="vitrine__sur">Registre des duels</span>
      <h2>Rang et statistiques</h2>
      <div className="rang-profil__corps">
        {/* Sans partie classée : 1 000 points, Bronze, comme au départ du classé */}
        {!errRang && <Plaque r={d.rang.data ?? { cote: COTE_DEPART, victoires: 0, defaites: 0 }} />}
        <div className="rang-profil__stats" id="rang-stats" hidden={sansStats && !estMoi}>
          {sansStats
            ? <><dl className="rang-chiffres" id="stats-duels" /><div className="rang-ratio" id="stats-ratio" /><ul className="rang-detail" id="stats-detail"><li className="rang-detail__vide">Les statistiques des duels s’afficheront une fois SQL/stats_profil.sql installé.</li></ul></>
            : <Statistiques stats={d.stats.data} />}
        </div>
      </div>
      <p className="rang-profil__note" id="rang-note">{note}</p>
    </section>
  );
}
