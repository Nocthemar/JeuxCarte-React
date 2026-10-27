// =====================================================================
//  Écran « Amis » (#/amis) : ses amis, et ce qu'on fait avec eux (supabase/amis.sql, lib/amis.js)
//   - les défis reçus (moins de 10 minutes) : Rejoindre (le salon privé de l'ami) ou Refuser ;
//   - les demandes reçues : Accepter ou Refuser ;
//   - ajouter un ami : chercher un joueur par son pseudo, lui envoyer une demande ;
//   - mes amis : en ligne / en duel / vu il y a…, et Défier, Profil, Échanger, Retirer ;
//   - les demandes envoyées, qu'on peut annuler.
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
function Statut({ a }) {
  if (a.en_duel) return <span className="amis-statut amis-statut--duel">En duel</span>;
  if (a.en_ligne) return <span className="amis-statut amis-statut--ligne">En ligne</span>;
  return <span className="amis-statut">{vuIlYa(a.vu_le)}</span>;
}

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

  const libre = () => occupe === null;   // un seul geste à la fois
  const e = etat && !etat.erreur ? etat : null;

  return (
    <Page id="amis" classes="page-amis" titre="Amis">
      <main className="amis">
        <header className="amis-entete">
          <span>Nocthémar</span>
          <h1>Les amis</h1>
          <p>Ajoute des amis, vois qui est en ligne, défie-les en duel ou propose-leur un échange.</p>
        </header>

        {!etat ? <p className="amis-vide">Chargement…</p>
          : etat.erreur ? <p className="amis-vide">Les amis ne sont pas encore prêts (supabase/amis.sql est-il lancé ?).</p> : (
            <>
              {/* Les défis reçus : en premier, ils n'attendent pas */}
              {e.defis.length > 0 && (
                <section className="amis-bloc amis-bloc--defis">
                  <h2>Défis</h2>
                  <ul className="amis-lignes">
                    {e.defis.map((d) => (
                      <li key={d.id} className="amis-ligne amis-ligne--defi">
                        <Portrait j={d} />
                        <span className="amis-ligne__texte"><b>{d.username}</b> te défie en duel</span>
                        <button type="button" className="amis-btn amis-btn--sang" disabled={!libre(`r:${d.id}`)} onClick={() => rejoindre(d)}>Rejoindre</button>
                        <button type="button" className="amis-btn" disabled={!libre(`r:${d.id}`)} onClick={() => agir(`r:${d.id}`, () => amis.repondreDefi(d.id, false), 'Défi refusé.')}>Refuser</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {e.recues.length > 0 && (
                <section className="amis-bloc">
                  <h2>Demandes reçues</h2>
                  <ul className="amis-lignes">
                    {e.recues.map((a) => (
                      <li key={a.discord_id} className="amis-ligne">
                        <Portrait j={a} />
                        <span className="amis-ligne__texte"><b>{a.username}</b> veut devenir ton ami</span>
                        <button type="button" className="amis-btn amis-btn--sang" disabled={!libre(`a:${a.discord_id}`)}
                          onClick={() => agir(`a:${a.discord_id}`, () => amis.repondre(a.discord_id, true), `${a.username} est maintenant ton ami.`)}>Accepter</button>
                        <button type="button" className="amis-btn" disabled={!libre(`a:${a.discord_id}`)}
                          onClick={() => agir(`a:${a.discord_id}`, () => amis.repondre(a.discord_id, false), 'Demande refusée.')}>Refuser</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="amis-bloc">
                <h2>Ajouter un ami</h2>
                <input type="search" className="amis-champ" placeholder="Cherche un joueur par son pseudo…" value={recherche} onChange={(ev) => setRecherche(ev.target.value)} />
                {recherche.trim().length >= 2 && (
                  <ul className="amis-lignes amis-lignes--recherche">
                    {!trouves.length ? <li className="amis-vide">Personne de ce nom.</li> : trouves.map((j) => (
                      <li key={j.discord_id} className="amis-ligne">
                        <Portrait j={j} />
                        <span className="amis-ligne__texte"><b>{j.username}</b></span>
                        {j.lien === 'ami' ? <span className="amis-ligne__note">Déjà ton ami</span>
                          : j.lien === 'envoyee' ? <span className="amis-ligne__note">Demande envoyée</span>
                            : <button type="button" className="amis-btn amis-btn--sang" disabled={!libre(`n:${j.discord_id}`)}
                                onClick={() => agir(`n:${j.discord_id}`, () => amis.demander(j.discord_id), (r) => (r === 'amis' ? `${j.username} est maintenant ton ami.` : `Demande envoyée à ${j.username}.`))}>
                                {j.lien === 'recue' ? 'Accepter sa demande' : 'Demander en ami'}
                              </button>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="amis-bloc">
                <h2>Mes amis <small>{e.amis.length}</small></h2>
                {!e.amis.length ? <p className="amis-vide">Tu n&apos;as pas encore d&apos;amis. Cherche un joueur ci-dessus pour lui envoyer une demande.</p> : (
                  <ul className="amis-cartes">
                    {e.amis.map((a) => (
                      <li key={a.discord_id} className={`amis-carte${a.en_ligne ? ' est-en-ligne' : ''}`}>
                        <Portrait j={a} grand />
                        <span className="amis-carte__nom">{a.username}</span>
                        <Statut a={a} />
                        <div className="amis-carte__actions">
                          <button type="button" className="amis-btn amis-btn--sang amis-btn--large" disabled={!libre(`d:${a.discord_id}`) || a.en_duel}
                            title={a.en_duel ? 'Il est déjà en duel' : 'Créer un salon privé et l\'y inviter'} onClick={() => defier(a)}>Défier</button>
                          <Link className="amis-btn" to={`/profil?id=${encodeURIComponent(a.discord_id)}`}>Profil</Link>
                          <Link className="amis-btn" to={`/marche?avec=${encodeURIComponent(a.discord_id)}`}>Échanger</Link>
                        </div>
                        <button type="button" className="amis-carte__retirer" disabled={!libre(`x:${a.discord_id}`)} onClick={() => retirer(a)}>Retirer</button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {e.envoyees.length > 0 && (
                <section className="amis-bloc">
                  <h2>Demandes envoyées</h2>
                  <ul className="amis-lignes">
                    {e.envoyees.map((a) => (
                      <li key={a.discord_id} className="amis-ligne">
                        <Portrait j={a} />
                        <span className="amis-ligne__texte"><b>{a.username}</b> n&apos;a pas encore répondu</span>
                        <button type="button" className="amis-btn" disabled={!libre(`x:${a.discord_id}`)}
                          onClick={() => agir(`x:${a.discord_id}`, () => amis.retirer(a.discord_id), 'Demande annulée.')}>Annuler</button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
      </main>
    </Page>
  );
}
