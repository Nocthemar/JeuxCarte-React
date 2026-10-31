// =====================================================================
//  Écran « Panneau MJ » (#/mj) : le Conseil du Maître du Jeu, pour le jeu de cartes
//  Trois salles (onglets) :
//   - Le royaume : les chiffres du jeu (joueurs, or et cristaux en circulation, duels, boosters, Caverne) ;
//   - Les joueurs : le registre à gauche ; à droite le dossier du joueur choisi (portrait, plaques chiffrées,
//     or, cristaux, Pass, boosters, Caverne, collection, historique de l'or, zone sensible) ;
//   - Le journal : toutes les transactions d'or, annulables.
//  Toutes les modifications passent par les fonctions SQL « mj_jeu_… » (supabase/mj.sql), qui vérifient côté
//  serveur que la personne connectée est MJ. Cacher cet écran ne suffirait pas : c'est la base qui protège.
//  Styles : styles/mj.css (pierre taillée, ivoire, un seul accent : le rouge sang du jeu).
//  (Les outils de l'ancien site, objets et boutique du marchand, ont été retirés le 27/10/2026.)
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { urlPublique } from '../lib/chemins.js';
import { RARETES } from '../data/affichage.js';
import { COULEURS_RARETE } from '../lib/booster.js';
import { tempsRestant } from '../lib/caverne/badges.js';

const SOURCES = { bot: 'En jeu', mj: 'MJ', boutique: 'Boutique', boutique_jour: 'Marchand', boutique_fun: 'Recyclage',
  histoire: 'Histoire', pass: 'Pass', echange: 'Marché', succes: 'Succès' };
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const dateCourte = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dateLongue = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const IMG = {
  or: 'img/Equipement/Or-icone.webp',
  cristal: 'img/OR/cristal.webp',
  booster: 'img/Booster/Booster.webp',
  caverne: 'img/Caverne/tas-3.webp',
};
const Image = ({ cle, className = 'mj-ico' }) => <img className={className} src={urlPublique(IMG[cle])} alt="" />;


// ---------------------------------------------------------------------
// Les pièces communes
// ---------------------------------------------------------------------
// Ajouter ou retirer : ce qu'il a (valeur), la quantité à bouger, et deux boutons qui disent ce qu'ils font
// (« − 10 », « + 10 »). Le − est grisé quand il n'y a rien à retirer.
function Ajusteur({ valeur, surChanger, unite = '', afficher = true }) {
  const [n, setN] = useState(1);   // la quantité part toujours de 1
  const q = `${nombre(n)}${unite ? ` ${unite}` : ''}`;
  return (
    <span className="mj-ajusteur">
      {afficher && valeur !== undefined && <strong className="mj-ajusteur__valeur" title="Ce qu'il a maintenant">{nombre(valeur)}</strong>}
      <input type="number" min="1" value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value) || 1))} aria-label="Quantité" />
      <button type="button" className="mj-ajusteur__moins" disabled={valeur === 0} onClick={() => surChanger(-n)} title={`Retirer ${q}`}>− {q}</button>
      <button type="button" className="mj-ajusteur__plus" onClick={() => surChanger(n)} title={`Ajouter ${q}`}>+ {q}</button>
    </span>
  );
}

// Le grimoire d'un joueur : toutes les cartes du jeu en vignettes, les siennes en couleur (avec leur nombre),
// les autres éteintes. Filtres par rareté, « seulement les siennes », recherche facultative. Cliquer une carte
// ouvre sa fiche à droite : en grand, combien il en a, et l'ajusteur pour en ajouter ou en retirer.
const ORDRE_RARETES = ['transcendante', 'legendaire', 'mythique', 'eveillee', 'commune'];
function Grimoire({ cartes, possedees, agir }) {
  const [rarete, setRarete] = useState('');
  const [siennes, setSiennes] = useState(false);
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState(null);
  const texte = recherche.trim().toLowerCase();
  const liste = cartes
    .filter((c) => (!rarete || c.rarity === rarete) && (!siennes || possedees.has(c.id)) && c.name.toLowerCase().includes(texte))
    .sort((a, b) => ORDRE_RARETES.indexOf(a.rarity) - ORDRE_RARETES.indexOf(b.rarity) || a.name.localeCompare(b.name, 'fr'));
  const c = cartes.find((x) => x.id === choisie);
  const n = c ? possedees.get(c.id) ?? 0 : 0;

  return (
    <div className="mj-grimoire">
      <div className="mj-grimoire__filtres">
        <div className="mj-filtres" role="group" aria-label="Rareté">
          <button type="button" className={!rarete ? 'est-actif' : ''} onClick={() => setRarete('')}>Toutes</button>
          {ORDRE_RARETES.map((r) => (
            <button key={r} type="button" className={rarete === r ? 'est-actif' : ''} style={{ '--rarete': COULEURS_RARETE[r] }} onClick={() => setRarete(rarete === r ? '' : r)}>{RARETES[r]}</button>
          ))}
        </div>
        <label className="mj-interrupteur"><input type="checkbox" checked={siennes} onChange={(e) => setSiennes(e.target.checked)} /><span>Seulement les siennes</span></label>
        <input type="search" placeholder="Chercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="mj-champ mj-grimoire__recherche" />
      </div>

      <div className="mj-grimoire__corps">
        {!liste.length ? <p className="mj-vide">Aucune carte ici.</p> : (
          <ul className="mj-vignettes">
            {liste.map((x) => {
              const q = possedees.get(x.id) ?? 0;
              return (
                <li key={x.id}>
                  <button type="button" className={`mj-vignette${q ? '' : ' est-absente'}${x.id === choisie ? ' est-choisie' : ''}`}
                    style={{ '--rarete': COULEURS_RARETE[x.rarity] ?? '#c5cad3' }} onClick={() => setChoisie(x.id)} title={`${x.name} · ${RARETES[x.rarity] ?? x.rarity}`}>
                    {x.image ? <img src={urlPublique(x.image)} alt="" loading="lazy" /> : <span className="mj-vignette__vide" />}
                    {q > 0 && <span className="mj-vignette__nombre">×{q}</span>}
                    <span className="mj-vignette__nom">{x.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <aside className="mj-fiche-carte" style={{ '--rarete': COULEURS_RARETE[c?.rarity] ?? '#c5cad3' }}>
          {!c ? <p className="mj-vide">Choisis une carte pour lui en donner ou lui en retirer.</p> : (
            <>
              {c.image && <img className="mj-fiche-carte__image" src={urlPublique(c.image)} alt="" />}
              <h4>{c.name}</h4>
              <span className="mj-fiche-carte__rarete">{RARETES[c.rarity] ?? c.rarity}</span>
              <p className="mj-fiche-carte__possede">{n ? <>Il en a <strong>{n}</strong> exemplaire{n > 1 ? 's' : ''}</> : 'Il ne l\'a pas encore'}</p>
              <Ajusteur key={c.id} valeur={n} afficher={false}
                surChanger={(k) => agir('mj_jeu_carte', { p_card_id: c.id, p_nombre: k }, k > 0 ? `${c.name} : ${k} exemplaire(s) ajouté(s)` : `${c.name} : ${-k} exemplaire(s) retiré(s)`)} />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// Une salle du dossier : une plaque de pierre, son titre gravé, et éventuellement son image
function Salle({ titre, image, children, className = '' }) {
  return (
    <section className={`mj-salle ${className}`}>
      <h3 className="mj-salle__titre">{image && <Image cle={image} />}{titre}</h3>
      {children}
    </section>
  );
}

function LigneTransaction({ t, nomJoueur, annuler }) {
  const annulable = !t.annulee && !t.annulation_de && t.amount !== 0;
  return (
    <li className={`mj-tx${t.annulee ? ' est-annulee' : ''}`}>
      <span className={`mj-tx__montant ${t.amount >= 0 ? 'est-gain' : 'est-perte'}`}>{t.amount >= 0 ? '+' : '−'}{nombre(Math.abs(t.amount))}</span>
      <span className="mj-tx__texte">
        {nomJoueur && <strong>{nomJoueur(t.discord_id)}</strong>}
        <span>{t.reason ?? '—'}</span>
      </span>
      <span className="mj-tx__source">{SOURCES[t.source] ?? t.source}</span>
      <time className="mj-tx__date">{dateCourte(t.created_at)}{t.annulee ? ' · annulée' : ''}</time>
      {annulable && annuler ? <button type="button" className="mj-tx__annuler" onClick={() => annuler(t.id)}>Annuler</button> : <span />}
    </li>
  );
}


// ---------------------------------------------------------------------
// Salle « Le royaume » : la vue d'ensemble
// ---------------------------------------------------------------------
function Royaume({ version }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    let actif = true;
    supabase.rpc('mj_jeu_stats').then(({ data, error }) => { if (actif) setS(error ? { erreur: error.message } : data); });
    return () => { actif = false; };
  }, [version]);
  if (!s) return <p className="mj-vide">Le registre s&apos;ouvre…</p>;
  if (s.erreur) return <p className="mj-vide">Erreur : {s.erreur} (supabase/mj.sql est-il lancé ?)</p>;
  const cav = (m) => s.caverne_7j?.[m] ?? { parties: 0, mises: 0, gains: 0 };

  return (
    <div className="mj-royaume">
      <div className="mj-steles">
        <article className="mj-stele mj-stele--grande">
          <span className="mj-stele__titre">Joueurs</span>
          <strong>{nombre(s.joueurs)}</strong>
          <small>{nombre(s.nouveaux_7j)} arrivés ces 7 derniers jours</small>
        </article>
        <article className="mj-stele">
          <Image cle="or" className="mj-stele__image" />
          <span className="mj-stele__titre">Or en circulation</span>
          <strong>{nombre(s.or_total)}</strong>
        </article>
        <article className="mj-stele">
          <Image cle="cristal" className="mj-stele__image" />
          <span className="mj-stele__titre">Cristaux</span>
          <strong>{nombre(s.cristaux_total)}</strong>
        </article>
        <article className="mj-stele">
          <span className="mj-stele__titre">Cartes possédées</span>
          <strong>{nombre(s.exemplaires)}</strong>
          <small>exemplaires, doublons compris</small>
        </article>
      </div>

      <div className="mj-steles mj-steles--petites">
        <article className="mj-stele"><span className="mj-stele__titre">Duels · 7 jours</span><strong>{nombre(s.duels_7j)}</strong><small>contre l&apos;Ombre et en Histoire</small></article>
        <article className="mj-stele"><Image cle="booster" className="mj-stele__image" /><span className="mj-stele__titre">Boosters ouverts · 7 jours</span><strong>{nombre(s.boosters_7j)}</strong></article>
        <article className="mj-stele"><span className="mj-stele__titre">Pass premium</span><strong>{nombre(s.premium)}</strong><small>cette saison</small></article>
        <article className="mj-stele"><Image cle="caverne" className="mj-stele__image" /><span className="mj-stele__titre">Caverne ouverte</span><strong>{nombre(s.caverne_ouverte)}</strong><small>joueurs avec un badge actif</small></article>
      </div>

      <Salle titre="La Caverne aux Trésors · 7 derniers jours" image="caverne">
        <div className="mj-caverne-bilan">
          {[['or', 'Or', 'or'], ['cristaux', 'Cristaux', 'cristal']].map(([m, nom, img]) => {
            const c = cav(m);
            const garde = c.mises - c.gains;
            return (
              <div key={m} className="mj-caverne-bilan__ligne">
                <span className="mj-caverne-bilan__nom"><Image cle={img} />{nom}</span>
                <span><small>Parties</small><strong>{nombre(c.parties)}</strong></span>
                <span><small>Misé</small><strong>{nombre(c.mises)}</strong></span>
                <span><small>Rendu</small><strong>{nombre(c.gains)}</strong></span>
                <span><small>Gardé par la Caverne</small><strong className={garde >= 0 ? 'est-gain' : 'est-perte'}>{nombre(garde)}</strong></span>
              </div>
            );
          })}
        </div>
      </Salle>
    </div>
  );
}


// ---------------------------------------------------------------------
// Salle « Les joueurs » : le dossier du joueur choisi
// ---------------------------------------------------------------------
function Dossier({ id, moi, cartes, version, rpc, rafraichir, annulerTx }) {
  const notifier = useNotifier();
  const [f, setF] = useState(null);
  const [tx, setTx] = useState([]);
  const [raison, setRaison] = useState('');   // la raison d'un geste en or, notée dans son historique

  useEffect(() => {
    let actif = true;
    Promise.all([
      supabase.rpc('mj_jeu_joueur', { p_discord_id: id }),
      supabase.from('transactions').select('*').eq('discord_id', id).order('created_at', { ascending: false }).limit(5),
    ]).then(([{ data, error }, { data: lignes }]) => {
      if (!actif) return;
      setF(error ? { erreur: error.message } : data);
      setTx(lignes ?? []);
    });
    return () => { actif = false; };
  }, [id, version]);

  if (!f) return <p className="mj-vide">Le dossier s&apos;ouvre…</p>;
  if (f.erreur) return <p className="mj-vide">Erreur : {f.erreur}</p>;
  const j = f.joueur;
  const estMoi = j.discord_id === moi.discord_id;
  // Une action, puis tout se recharge
  const agir = async (nom, params, message) => { if (await rpc(nom, { p_discord_id: id, ...params }, message)) rafraichir(); };

  const or = (n) => agir('mj_jeu_or', { p_montant: n, p_raison: raison.trim() },
    n > 0 ? `${nombre(n)} pièces données` : `${nombre(-n)} pièces retirées`);
  async function basculerMj() {
    if (!confirm(j.is_mj ? `Retirer le rôle MJ à ${j.username} ?` : `Nommer ${j.username} MJ ? Il aura accès à ce panneau.`)) return;
    await agir('mj_jeu_role', { p_mj: !j.is_mj }, 'Rôle mis à jour');
  }
  async function reinitialiser() {
    if (!confirm(`Réinitialiser ${j.username} à 100 % ?\nOr à 0, toutes ses cartes, son grimoire et son deck, ses boosters, son Pass de saison, le mode Histoire, ses plateaux, son rang classé, ses échanges, contrats, annonces et souhaits, ses cosmétiques et son historique : tout est effacé. Seul le compte est gardé.`)) return;
    if (prompt(`Pour confirmer, écris : ${j.username}`) !== j.username) { notifier('Réinitialisation annulée', 'erreur'); return; }
    if (await rpc('mj_reset_player', { p_discord_id: id }, `${j.username} a été réinitialisé`)) rafraichir();
  }

  const palier = f.pass ? Math.min(f.pass.nb_paliers, Math.floor(f.pass.xp / f.pass.xp_par_palier)) : 0;
  const d = f.duels ?? {};
  const exemplaires = f.cartes.reduce((t, c) => t + c.quantite, 0);

  return (
    <article className="mj-dossier">
      {/* Le bandeau : le portrait en médaillon, le nom, et les plaques chiffrées */}
      <header className="mj-bandeau">
        <div className="mj-medaillon">
          {j.avatar_url ? <img src={j.avatar_url} alt="" /> : <span className="mj-medaillon__vide">{(j.username ?? '?').slice(0, 1)}</span>}
        </div>
        <div className="mj-bandeau__nom">
          <span className="mj-bandeau__sur">{j.is_mj ? 'Maître du Jeu' : 'Joueur'} · inscrit le {dateLongue(j.cree_le)}</span>
          <h2>{j.username ?? 'Sans pseudo'}</h2>
          <span className="mj-bandeau__meta">{j.email ?? 'Compte Discord'} · <Link to={`/profil?id=${encodeURIComponent(j.discord_id)}`}>voir son profil</Link></span>
        </div>
        <ul className="mj-plaques">
          <li><Image cle="or" /><strong>{nombre(f.bourse.or)}</strong><small>pièces</small></li>
          <li><Image cle="cristal" /><strong>{nombre(f.bourse.cristaux)}</strong><small>cristaux</small></li>
          <li><strong>{nombre(f.cartes.length)}</strong><small>cartes · {nombre(exemplaires)} ex.</small></li>
          <li><strong>{nombre(d.victoires)}<i>/</i>{nombre(d.defaites)}</strong><small>victoires / défaites</small></li>
          <li><strong>{nombre(f.succes.obtenus)}<i>/</i>{nombre(f.succes.total)}</strong><small>succès</small></li>
        </ul>
      </header>

      <div className="mj-salles">
        <Salle titre="Monnaies" image="or">
          <div className="mj-rangee">
            <span className="mj-rangee__nom"><Image cle="or" />Pièces d&apos;or</span>
            <Ajusteur valeur={f.bourse.or} surChanger={or} />
          </div>
          <input type="text" value={raison} onChange={(e) => setRaison(e.target.value)} className="mj-champ mj-raison"
            placeholder="Raison, notée dans son historique (facultatif) : tournoi, geste, erreur…" />
          <div className="mj-rangee">
            <span className="mj-rangee__nom"><Image cle="cristal" />Cristaux</span>
            <Ajusteur valeur={f.bourse.cristaux} surChanger={(n) => agir('mj_jeu_cristaux', { p_montant: n }, n > 0 ? `${nombre(n)} cristaux donnés` : `${nombre(-n)} cristaux retirés`)} />
          </div>
        </Salle>

        <Salle titre={f.pass ? `Pass · ${f.pass.saison}` : 'Pass de saison'}>
          {!f.pass ? <p className="mj-vide">Aucune saison en cours.</p> : (
            <>
              <div className="mj-jauge" aria-label={`Palier ${palier} sur ${f.pass.nb_paliers}`}>
                <span style={{ width: `${(palier / f.pass.nb_paliers) * 100}%` }} />
              </div>
              <p className="mj-jauge__texte">Palier <strong>{palier}</strong> sur {f.pass.nb_paliers} · {nombre(f.pass.xp)} XP
                {f.pass.premium && <span className="mj-sceau">Premium</span>}</p>
              <div className="mj-rangee">
                <span className="mj-rangee__nom">XP</span>
                <Ajusteur valeur={f.pass.xp} unite="XP" surChanger={(n) => agir('mj_jeu_pass', { p_xp: n }, n > 0 ? `${nombre(n)} XP ajoutés` : `${nombre(-n)} XP retirés`)} />
              </div>
              <button type="button" className="mj-btn mj-btn--large" onClick={() => agir('mj_jeu_pass', { p_xp: 0, p_premium: !f.pass.premium }, f.pass.premium ? 'Premium retiré' : 'Premium offert')}>
                {f.pass.premium ? 'Retirer le premium' : 'Offrir le premium'}
              </button>
            </>
          )}
        </Salle>

        <Salle titre="Boosters à ouvrir" image="booster">
          {f.boosters.map((b) => (
            <div key={b.id} className="mj-rangee">
              <span className="mj-rangee__nom">{b.nom}</span>
              <Ajusteur valeur={b.quantite} surChanger={(n) => agir('mj_jeu_booster', { p_booster_id: b.id, p_nombre: n }, n > 0 ? `${n} ${b.nom} ajouté(s)` : `${-n} ${b.nom} retiré(s)`)} />
            </div>
          ))}
        </Salle>

        <Salle titre="Caverne aux Trésors" image="caverne" className="mj-salle--large">
          <div className="mj-caverne">
            <div className="mj-caverne__etat">
              <span className={`mj-sceau${f.caverne.jusqu_a ? ' mj-sceau--ouvert' : ''}`}>{f.caverne.jusqu_a ? 'Ouverte' : 'Scellée'}</span>
              <p>{f.caverne.jusqu_a ? <>encore <strong>{tempsRestant(f.caverne.jusqu_a)}</strong></> : 'aucun badge actif'} · {nombre(f.caverne.parties_7j)} parties en 7 jours</p>
              {/* ajouter ou retirer du temps d'accès (retirer plus que ce qui reste : la Caverne se referme) */}
              <div className="mj-durees">
                {[[24, '24 h'], [168, '7 jours'], [720, '30 jours']].map(([h, t]) => (
                  <span key={h} className="mj-ajusteur">
                    <button type="button" className="mj-ajusteur__moins" disabled={!f.caverne.jusqu_a}
                      onClick={() => agir('mj_jeu_acces_caverne', { p_heures: -h }, `${t} retirés`)}>− {t}</button>
                    <button type="button" className="mj-ajusteur__plus"
                      onClick={() => agir('mj_jeu_acces_caverne', { p_heures: h }, `${t} ajoutés`)}>+ {t}</button>
                  </span>
                ))}
              </div>
              {f.caverne.jusqu_a && <button type="button" className="mj-btn mj-btn--danger" onClick={() => agir('mj_jeu_acces_caverne', { p_heures: 0 }, 'Caverne refermée')}>Refermer tout de suite</button>}
            </div>
            <ul className="mj-badges">
              {f.caverne.badges.map((b) => (
                <li key={b.id}>
                  <img src={urlPublique(b.image)} alt={`Badge ${b.nom}`} />
                  {b.nombre > 0 && <span className="mj-cartes__nombre" title="Badges qu'il garde">×{b.nombre}</span>}
                  <Ajusteur valeur={b.nombre} afficher={false} surChanger={(n) => agir('mj_jeu_badge', { p_badge: b.id, p_nombre: n }, n > 0 ? `Badge ${b.nom} ajouté` : `Badge ${b.nom} retiré`)} />
                </li>
              ))}
            </ul>
          </div>
        </Salle>

        <Salle titre={`Collection · ${nombre(f.cartes.length)} cartes`} className="mj-salle--large">
          <Grimoire cartes={cartes} possedees={new Map(f.cartes.map((c) => [c.id, c.quantite]))} agir={agir} />
        </Salle>

        <Salle titre="Historique de l'or" image="or" className="mj-salle--large">
          {tx.length ? <ul className="mj-journal">{tx.map((t) => <LigneTransaction key={t.id} t={t} annuler={annulerTx} />)}</ul>
            : <p className="mj-vide">Aucune transaction.</p>}
        </Salle>

        <Salle titre="Zone sensible" className="mj-salle--large mj-salle--danger">
          <p className="mj-aide">Ces gestes ne se défont pas d&apos;un clic. La réinitialisation efface toute la progression du joueur.</p>
          <div className="mj-form__boutons">
            {!estMoi && <button type="button" className="mj-btn" onClick={basculerMj}>{j.is_mj ? 'Retirer le rôle MJ' : 'Nommer MJ'}</button>}
            <button type="button" className="mj-btn mj-btn--danger" onClick={reinitialiser}>Réinitialiser le joueur</button>
          </div>
        </Salle>
      </div>
    </article>
  );
}

function Joueurs({ joueurs, ...dossier }) {
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState(null);
  const filtre = recherche.trim().toLowerCase();
  const liste = joueurs.filter((j) => (j.username ?? '').toLowerCase().includes(filtre));

  return (
    <div className="mj-joueurs">
      <aside className="mj-registre">
        <h2 className="mj-registre__titre">Le registre <small>{nombre(joueurs.length)}</small></h2>
        <input type="search" placeholder="Chercher un joueur…" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="mj-champ" />
        <ul>
          {liste.length ? liste.map((j) => (
            <li key={j.discord_id}>
              <button type="button" className={j.discord_id === selection ? 'est-actif' : ''} onClick={() => setSelection(j.discord_id)}>
                <span className="mj-registre__avatar">{j.avatar_url ? <img src={j.avatar_url} alt="" /> : (j.username ?? '?').slice(0, 1)}</span>
                <span className="mj-registre__nom">{j.username ?? 'Sans pseudo'}{j.is_mj && <small>Maître du Jeu</small>}</span>
                <span className="mj-registre__or">{nombre(j.or)}<Image cle="or" /></span>
              </button>
            </li>
          )) : <p className="mj-vide">Personne de ce nom.</p>}
        </ul>
      </aside>
      {!selection ? (
        <div className="mj-attente">
          <p>Choisis un joueur dans le registre pour ouvrir son dossier.</p>
        </div>
      ) : <Dossier id={selection} {...dossier} />}
    </div>
  );
}


// ---------------------------------------------------------------------
// Salle « Le journal »
// ---------------------------------------------------------------------
function Journal({ joueurs, version, annulerTx }) {
  const [filtre, setFiltre] = useState('');
  const [journal, setJournal] = useState(null);   // { data } ou { erreur }

  useEffect(() => {
    let actif = true;
    let requete = supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(200);
    if (filtre) requete = requete.eq('discord_id', filtre);
    requete.then(({ data, error }) => { if (actif) setJournal(error ? { erreur: error.message } : { data }); });
    return () => { actif = false; };
  }, [filtre, version]);

  const nomJoueur = (id) => joueurs.find((j) => j.discord_id === id)?.username ?? id;

  return (
    <Salle titre="Le journal de l'or" image="or" className="mj-salle--journal">
      <div className="mj-form">
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} className="mj-champ">
          <option value="">Tous les joueurs</option>
          {joueurs.map((j) => <option key={j.discord_id} value={j.discord_id}>{j.username ?? j.discord_id}</option>)}
        </select>
        <p className="mj-aide">« Annuler » applique le montant inverse et garde une trace.</p>
      </div>
      {!journal ? <p className="mj-vide">Le journal s&apos;ouvre…</p>
        : journal.erreur ? <p className="mj-vide">Erreur : {journal.erreur}</p>
          : journal.data.length ? <ul className="mj-journal">{journal.data.map((t) => <LigneTransaction key={t.id} t={t} nomJoueur={nomJoueur} annuler={annulerTx} />)}</ul>
            : <p className="mj-vide">Aucune transaction.</p>}
    </Salle>
  );
}


// ---------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------
const ONGLETS = [['royaume', 'Le royaume'], ['joueurs', 'Les joueurs'], ['journal', 'Le journal']];

export default function Mj() {
  const { joueur: moi } = useAuth();
  const notifier = useNotifier();
  const estMj = !!moi?.is_mj;
  const [onglet, setOnglet] = useState('royaume');
  const [joueurs, setJoueurs] = useState(null);   // [{ discord_id, username, avatar_url, is_mj, or }]
  const [cartes, setCartes] = useState([]);       // le catalogue des cartes, pour en donner
  // Chaque modification fait monter la version : tout ce qui est affiché se recharge
  const [version, setVersion] = useState(0);
  const rafraichir = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!estMj) return undefined;
    let actif = true;
    Promise.all([
      supabase.from('players').select('discord_id, username, avatar_url, is_mj, wallet:wallets(balance)').order('username'),
      supabase.from('cards').select('id, name, rarity, image').order('name'),
    ]).then(([{ data, error }, { data: catalogue }]) => {
      if (!actif) return;
      if (error) notifier('Impossible de charger les joueurs : ' + error.message, 'erreur');
      else setJoueurs(data.map((j) => ({ ...j, or: (Array.isArray(j.wallet) ? j.wallet[0] : j.wallet)?.balance ?? 0 })));
      setCartes(catalogue ?? []);
    });
    return () => { actif = false; };
  }, [estMj, version, notifier]);

  // Appel d'une fonction SQL avec gestion d'erreur et message
  const rpc = useCallback(async (nom, params, succes) => {
    const { error } = await supabase.rpc(nom, params);
    if (error) { notifier(error.message, 'erreur'); return false; }
    if (succes) notifier(succes);
    return true;   // réussi, même si la réponse vaut 0 (« il n'en a plus ») : la page doit se recharger
  }, [notifier]);

  const annulerTx = useCallback(async (id) => {
    if (!confirm('Annuler cette transaction ? Le montant inverse sera appliqué.')) return;
    if (await rpc('mj_cancel_transaction', { p_id: Number(id) }, 'Transaction annulée')) rafraichir();
  }, [rpc, rafraichir]);

  return (
    <Page id="mj" classes="page-mj" titre="Panneau MJ">
      <main className="mj">
        {!estMj ? (
          <section className="mj-refus">
            <h1>Le Conseil du Maître du Jeu</h1>
            <p>Cette salle est réservée aux Maîtres du Jeu.</p>
          </section>
        ) : !joueurs ? <p className="mj-vide">Le Conseil se réunit…</p> : (
          <>
            <header className="mj-entete">
              <div className="mj-entete__titre">
                <span>Duel des Couronnes</span>
                <h1>Le Conseil du Maître du Jeu</h1>
              </div>
              <nav className="mj-onglets" role="tablist" aria-label="Salles du Conseil">
                {ONGLETS.map(([id, libelle]) => (
                  <button key={id} type="button" role="tab" aria-selected={onglet === id} className={onglet === id ? 'est-actif' : ''} onClick={() => setOnglet(id)}>{libelle}</button>
                ))}
              </nav>
            </header>
            {onglet === 'royaume' && <Royaume version={version} />}
            {onglet === 'joueurs' && <Joueurs joueurs={joueurs} moi={moi} cartes={cartes} version={version} rpc={rpc} rafraichir={rafraichir} annulerTx={annulerTx} />}
            {onglet === 'journal' && <Journal joueurs={joueurs} version={version} annulerTx={annulerTx} />}
          </>
        )}
      </main>
    </Page>
  );
}
