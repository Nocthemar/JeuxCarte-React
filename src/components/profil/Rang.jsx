// =====================================================================
//  Rang et statistiques d'un joueur, visibles par tous (styles/profil-heros.css)
//  (les données : useRang, lib/rang.js)
//  - PlaqueRang : le palier du classé et la progression vers le suivant (colonne du héros) ;
//  - Registre : victoires, défaites, taux, cartes, contre l'Ombre et contre des joueurs (colonne de droite).
// =====================================================================

// Paliers du classé : [cote minimum, nom] (les mêmes que le duel en ligne et le SQL)
const PALIERS_CLASSE = [[0, 'Bronze'], [1100, 'Argent'], [1250, 'Or'], [1400, 'Platine'], [1550, 'Diamant'], [1700, 'Couronne']];
const COTE_DEPART = 1000;
const LARGEUR_PALIER = 150;   // un palier fait 150 points (Bronze, sans plancher, est mesuré pareil)
const nombreFr = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const pluriel = (n, mot) => `${nombreFr(n)} ${mot}${n > 1 ? 's' : ''}`;
const taux = (v, d) => (v + d ? `${Math.round((v / (v + d)) * 100)} %` : '—');

// Le palier du classé (sans partie classée : 1 000 points, Bronze, comme au départ), et la jauge de tous
// les paliers : une case par palier, celles déjà franchies pleines, un repère à la position du joueur
export function PlaqueRang({ rang }) {
  if (!rang || rang.error) return null;
  const r = rang.data ?? { cote: COTE_DEPART, victoires: 0, defaites: 0 };
  const i = PALIERS_CLASSE.findLastIndex(([min]) => r.cote >= min);
  const [min, nom] = PALIERS_CLASSE[i];
  const suivant = PALIERS_CLASSE[i + 1];
  const bas = suivant ? suivant[0] - LARGEUR_PALIER : min;
  const pct = suivant ? Math.max(0, Math.min(100, Math.round(((r.cote - bas) / (suivant[0] - bas)) * 100))) : 100;
  const position = ((i + pct / 100) / PALIERS_CLASSE.length) * 100;   // sur toute la jauge, en %
  const parties = r.victoires + r.defaites;
  return (
    <div className={`heros-rang heros-rang--${nom.toLowerCase()}`} id="rang-plaque">
      <div className="heros-rang__haut">
        <span className="heros-rang__embleme" aria-hidden="true"><b>{nom[0]}</b></span>
        <div>
          <span className="heros-sur">Rang classé</span>
          <strong className="heros-rang__nom" id="rang-nom">{nom}</strong>
          <span className="heros-rang__cote" id="rang-cote">{nombreFr(r.cote)} points</span>
        </div>
      </div>
      <div className="heros-paliers" style={{ '--position': `${position.toFixed(1)}%` }} role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow={pct} aria-label={suivant ? `Progression vers ${suivant[1]} : ${pct} %` : 'Palier le plus haut'}>
        {PALIERS_CLASSE.map(([m, n], k) => (
          <span key={n} className={`heros-paliers__case heros-paliers__case--${n.toLowerCase()}${k < i ? ' est-franchi' : k === i ? ' est-actuel' : ''}`}
            title={k ? `${n} : dès ${nombreFr(m)} points` : `${n} : le palier de départ`}>{n}</span>
        ))}
        <span className="heros-paliers__repere" aria-hidden="true" />
      </div>
      <p className="heros-rang__pied">
        <span>{suivant ? <>Encore <b>{nombreFr(suivant[0] - r.cote)}</b> pour {suivant[1]} ({nombreFr(suivant[0])})</> : 'Palier le plus haut atteint'}</span>
        <span>{parties ? `${nombreFr(r.victoires)} V · ${nombreFr(r.defaites)} D · ${taux(r.victoires, r.defaites)} en classé` : 'Aucune partie classée'}</span>
      </p>
    </div>
  );
}

// Le registre des duels : les chiffres, la barre des victoires et le détail par adversaire
export function Registre({ d, estMoi }) {
  if (!d) return null;
  const errRang = !!d.rang.error;
  const sansStats = !!d.stats.error || !d.stats.data;
  if (sansStats) {
    return estMoi
      ? <p className="vide">Les statistiques des duels s’afficheront une fois SQL/stats_profil.sql installé.</p>
      : null;
  }
  const s = d.stats.data;
  const v = s.victoires ?? 0;
  const df = s.defaites ?? 0;
  const pctV = v + df ? Math.round((v / (v + df)) * 100) : 0;
  const note = [
    errRang ? '' : 'Le rang monte ou descend en partie classée (environ 16 points par partie).',
    'Les statistiques comptent les duels terminés depuis le Pass de saison, hors mode Histoire et abandons.',
  ].filter(Boolean).join(' ');
  return (
    <div className="registre" id="stats-duels" title={note}>
      <dl className="registre__chiffres">
        <div className="registre__chiffre registre__chiffre--v"><dt>Victoires</dt><dd>{nombreFr(v)}</dd></div>
        <div className="registre__chiffre registre__chiffre--d"><dt>Défaites</dt><dd>{nombreFr(df)}</dd></div>
        <div className="registre__chiffre"><dt>Taux</dt><dd>{taux(v, df)}</dd></div>
        <div className="registre__chiffre" title={s.exemplaires > s.cartes ? `${pluriel(s.exemplaires, 'exemplaire')}, doublons compris` : undefined}>
          <dt>Cartes</dt><dd>{nombreFr(s.cartes)}</dd>
        </div>
      </dl>
      <div className={`heros-jauge heros-jauge--ratio${v + df ? '' : ' heros-jauge--vide'}`} role="img" aria-label={`${pctV} % de victoires`}>
        <span style={{ width: `${pctV}%` }} />
      </div>
      <p className="registre__legende">{v + df ? `${pluriel(v + df, 'duel')} terminé${v + df > 1 ? 's' : ''}` : 'Aucun duel terminé'}</p>
      <ul className="registre__detail">
        {[['Contre l’Ombre', s.ia_victoires ?? 0, s.ia_defaites ?? 0], ['Contre des joueurs', s.joueurs_victoires ?? 0, s.joueurs_defaites ?? 0]].map(([titre, lv, ld]) => (
          <li key={titre}><span>{titre}</span><b>{nombreFr(lv)} V · {nombreFr(ld)} D</b><small>{taux(lv, ld)}</small></li>
        ))}
      </ul>
      <p className="registre__note">{note}</p>
    </div>
  );
}
