// =====================================================================
//  Écran « Amis » (#/amis) : ses amis, et ce qu'on fait avec eux (supabase/amis.sql, lib/amis.js)
//  La salle des étendards :
//   - en haut, les défis reçus (moins de 10 minutes) : Rejoindre (le salon privé de l'ami) ou Refuser ;
//   - un bandeau : chercher un joueur par son pseudo ; les demandes reçues (Accepter / Refuser) et envoyées (Annuler) ;
//   - la salle : un étendard par ami (rouge sang en ligne, gris délavé absent), ceux en ligne d'abord,
//     avec Défier, Profil, Échanger, Retirer.
//  Défier : on crée un salon privé (lib/salon.js), on y entre comme hôte (#/duel?salon=CODE) et l'ami reçoit
//  le défi ; « Rejoindre » le mène dans ce même salon. C'est le duel en ligne habituel.
//  L'écran se relit toutes les 20 secondes (un ami qui se connecte, un défi qui arrive).
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { amis, vuIlYa } from '../lib/amis.js';
import { nouveauCode } from '../lib/salon.js';
import { retenirHote } from '../lib/ligne.js';
import Chargement from '../components/Chargement.jsx';

const RELIRE = 20000;   // ms

// Le portrait d'un joueur dans son hexagone (l'initiale, sans portrait)
function Portrait({ j, grand = false }) {
  return (
    <span className={`amis-portrait${grand ? ' amis-portrait--grand' : ''}`}>
      {j.avatar_url ? <img src={j.avatar_url} alt="" /> : (j.username ?? '?').slice(0, 1)}
    </span>
  );
}

// Où en est un ami : en duel, en ligne, ou vu il y a…
const etatDe = (a) => (a.en_duel ? 'duel' : a.en_ligne ? 'ligne' : 'absent');
const LIBELLE = { duel: 'En duel', ligne: 'En ligne' };
const RANG = { duel: 0, ligne: 0, absent: 1 };

export default function PageAmis() {
  const { joueur } = useAuth();
  const notifier = useNotifier();
  const naviguer = useNavigate();
  const [etat, setEtat] = useState(null);   // amis_etat, ou { erreur }
  const [recherche, setRecherche] = useState('');
  const [trouves, setTrouves] = useState([]);
  const [occupe, setOccupe] = useState(null);

  const relire = useCallback(() => amis.etat().then(setEtat).catch((e) => setEtat({ erreur: e.message })), []);
  useEffect(() => {
    if (!joueur) return undefined;
    relire();
    const t = setInterval(relire, RELIRE);
    return () => clearInterval(t);
  }, [joueur, relire]);

  // La recherche, un instant après la dernière lettre tapée
  useEffect(() => {
    const t = recherche.trim();
    if (t.length < 2) return undefined;   // (la liste n'est pas affichée en dessous de deux lettres)
    let actif = true;
    const minuteur = setTimeout(() => amis.chercher(t).then((r) => { if (actif) setTrouves(r ?? []); }).catch(() => {}), 250);
    return () => { actif = false; clearTimeout(minuteur); };
  }, [recherche, etat]);

  // Un geste : on l'envoie, on dit ce qui s'est passé, on relit tout
  const agir = async (cle, fn, message) => {
    setOccupe(cle);
    try { const r = await fn(); if (message) notifier(typeof message === 'function' ? message(r) : message); await relire(); return r; }
    catch (e) { notifier(e.message || 'Impossible pour le moment.', 'erreur'); return undefined; }
    finally { setOccupe(null); }
  };

  async function defier(a) {
    const code = nouveauCode();
    const ok = await agir(`d:${a.discord_id}`, () => amis.defier(a.discord_id, code).then(() => true), `Défi envoyé à ${a.username}. Il a 10 minutes pour te rejoindre.`);
    if (!ok) return;
    retenirHote(code, true);
    naviguer(`/duel?salon=${code}`);
  }
  async function rejoindre(d) {
    const code = await agir(`r:${d.id}`, () => amis.repondreDefi(d.id, true));
    if (code) naviguer(`/duel?salon=${code}`);
  }
  async function retirer(a) {
    if (!confirm(`Retirer ${a.username} de tes amis ?`)) return;
    await agir(`x:${a.discord_id}`, () => amis.retirer(a.discord_id), `${a.username} n'est plus dans tes amis.`);
  }

  const libre = occupe === null;   // un seul geste à la fois
  const e = etat && !etat.erreur ? etat : null;
  const tries = e ? [...e.amis].sort((x, y) => RANG[etatDe(x)] - RANG[etatDe(y)]) : [];
  const enLigne = tries.filter((a) => etatDe(a) !== 'absent').length;

  return (
    <Page id="amis" classes="page-amis" titre="Amis">
      <main className="amis">
        <header className="amis-entete">
          <span>La salle des étendards</span>
          <h1>Compagnons</h1>
          {e && <p>{enLigne} en ligne sur {e.amis.length}</p>}
        </header>

        {!etat ? <Chargement texte="Tes compagnons arrivent…" />
          : etat.erreur ? <p className="amis-vide">Les amis ne sont pas encore prêts (supabase/amis.sql est-il lancé ?).</p> : (
            <>
              {/* Les défis reçus : en premier, ils n'attendent pas */}
              {e.defis.map((d) => (
                <div key={d.id} className="amis-defi">
                  <Portrait j={d} />
                  <p><b>{d.username}</b> te défie en duel</p>
                  <button type="button" className="amis-btn amis-btn--ivoire" disabled={!libre} onClick={() => rejoindre(d)}>Rejoindre</button>
                  <button type="button" className="amis-lien" disabled={!libre} onClick={() => agir(`r:${d.id}`, () => amis.repondreDefi(d.id, false), 'Défi refusé.')}>Refuser</button>
                </div>
              ))}

              {/* Le bandeau : chercher un joueur, et les demandes */}
              <div className="amis-bandeau">
                <div className="amis-bandeau__chercher">
                  <h2>Ajouter un ami</h2>
                  <input type="search" className="amis-champ" placeholder="Pseudo d'un joueur…" value={recherche} onChange={(ev) => setRecherche(ev.target.value)} />
                  {recherche.trim().length >= 2 && (
                    <ul className="amis-lignes">
                      {!trouves.length ? <li className="amis-vide">Personne de ce nom.</li> : trouves.map((j) => (
                        <li key={j.discord_id} className="amis-ligne">
                          <Portrait j={j} />
                          <span className="amis-ligne__nom">{j.username}</span>
                          {j.lien === 'ami' ? <span className="amis-ligne__note">Déjà ami</span>
                            : j.lien === 'envoyee' ? <span className="amis-ligne__note">Demande envoyée</span>
                              : <button type="button" className="amis-btn" disabled={!libre}
                                  onClick={() => agir(`n:${j.discord_id}`, () => amis.demander(j.discord_id), (r) => (r === 'amis' ? `${j.username} est maintenant ton ami.` : `Demande envoyée à ${j.username}.`))}>
                                  {j.lien === 'recue' ? 'Accepter' : 'Demander'}
                                </button>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="amis-bandeau__demandes">
                  <h2>Demandes {e.recues.length > 0 && <small>{e.recues.length}</small>}</h2>
                  {!e.recues.length && !e.envoyees.length && <p className="amis-vide">Aucune demande en cours.</p>}
                  <ul className="amis-lignes">
                    {e.recues.map((a) => (
                      <li key={a.discord_id} className="amis-ligne amis-ligne--recue">
                        <Portrait j={a} />
                        <span className="amis-ligne__nom">{a.username}</span>
                        <button type="button" className="amis-btn" disabled={!libre}
                          onClick={() => agir(`a:${a.discord_id}`, () => amis.repondre(a.discord_id, true), `${a.username} est maintenant ton ami.`)}>Accepter</button>
                        <button type="button" className="amis-lien" disabled={!libre}
                          onClick={() => agir(`a:${a.discord_id}`, () => amis.repondre(a.discord_id, false), 'Demande refusée.')}>Refuser</button>
                      </li>
                    ))}
                    {e.envoyees.map((a) => (
                      <li key={a.discord_id} className="amis-ligne">
                        <Portrait j={a} />
                        <span className="amis-ligne__nom">{a.username} <i>n&apos;a pas répondu</i></span>
                        <button type="button" className="amis-lien" disabled={!libre}
                          onClick={() => agir(`x:${a.discord_id}`, () => amis.retirer(a.discord_id), 'Demande annulée.')}>Annuler</button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* La salle : un étendard par ami, ceux en ligne d'abord */}
              <section className="amis-salle">
                {!tries.length ? (
                  <div className="amis-salle__vide">
                    <p>Aucun étendard dans la salle.</p>
                    <span>Cherche un joueur ci-dessus pour lui envoyer une demande.</span>
                  </div>
                ) : (
                  <ul className="amis-etendards">
                    {tries.map((a) => {
                      const s = etatDe(a);
                      return (
                        <li key={a.discord_id} className={`amis-etendard est-${s}`}>
                          <span className="amis-etendard__tringle" aria-hidden="true" />
                          <div className="amis-etendard__tissu">
                            <Portrait j={a} grand />
                            <span className="amis-etendard__nom">{a.username}</span>
                            <span className="amis-etendard__etat">{LIBELLE[s] ?? vuIlYa(a.vu_le)}</span>
                            <button type="button" className="amis-btn amis-btn--ivoire" disabled={!libre || a.en_duel}
                              title={a.en_duel ? 'Il est déjà en duel' : 'Créer un salon privé et l\'y inviter'} onClick={() => defier(a)}>Défier</button>
                            <span className="amis-etendard__liens">
                              <Link to={`/profil?id=${encodeURIComponent(a.discord_id)}`}>Profil</Link>
                              <Link to={`/marche?avec=${encodeURIComponent(a.discord_id)}`}>Échanger</Link>
                            </span>
                            <button type="button" className="amis-lien amis-etendard__retirer" disabled={!libre} onClick={() => retirer(a)}>Retirer</button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          )}
      </main>
    </Page>
  );
}
