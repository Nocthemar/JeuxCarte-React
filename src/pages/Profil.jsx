// =====================================================================
//  Écran « Profil » (ancien profil.html + JS/profil.js, même HTML), consacré au Duel des Couronnes
//  #/profil           -> mon profil (badges, rang, deck, trésor, Duel des Couronnes)
//  #/profil?id=12345  -> le profil public d'un autre joueur (ID Discord) : badges, rang, deck en lecture seule,
//                        et « Proposer un échange »
//  Le thème équipé par le joueur colore toute la page (accents --accent, --vif).
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Carte from '../components/Carte.jsx';
import Deck from '../components/Deck.jsx';
import Badge from '../components/Badge.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import Rang from '../components/profil/Rang.jsx';
import Tresor from '../components/profil/Tresor.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useDeck } from '../lib/deck.js';
import { activerGlisser } from '../lib/glisser.js';
import { lireChoix } from '../lib/grimoire.js';
import { lienSite } from '../lib/lienSite.js';
import { RARETES_SUCCES, pourcentageTexte } from '../lib/succes.js';
import { TAILLE_DECK } from '../data/regles.js';
import { OBJETS } from '../data/cartes.js';
import { objetDepuisNom } from '../moteur/index.js';

// Le joueur + ses cosmétiques équipés, en une seule requête
const SELECT_JOUEUR = `
  *,
  banner:items!players_banner_item_id_fkey(*),
  title:items!players_title_item_id_fkey(*),
  theme:items!players_theme_item_id_fkey(*)
`;
const couleur = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : null);

// Badges : les succès épinglés par le joueur (jusqu'à 3), visibles par tous.
// Sur son propre profil sans badge : un lien pour les choisir. Ailleurs sans badge : section cachée.
function Badges({ badges, estMoi }) {
  if (!badges || (!badges.length && !estMoi)) return null;
  return (
    <section id="badges-profil" className="carte badges-profil">
      <span className="vitrine__sur">Hauts faits</span>
      <h2>Badges</h2>
      <div id="badges" className="badges-profil__liste">
        {badges.length ? badges.map((s) => (
          <div key={s.id} className="badge-profil" title={s.description}>
            <Badge s={s} taille="grand" />
            <strong className="badge-profil__nom">{s.nom}</strong>
            <span className={`rarete-succes rarete-succes--${s.rarete}`}>{RARETES_SUCCES[s.rarete]?.nom ?? 'Commun'}</span>
            <small className="badge-profil__pct">{pourcentageTexte(s.pourcentage)} des joueurs</small>
          </div>
        )) : <p className="vide">Aucun badge épinglé pour le moment.</p>}
      </div>
      {estMoi && <Link id="lien-succes" className="btn-collection badges-profil__lien" to="/succes">{badges.length ? 'Changer mes badges' : 'Choisir mes badges'}</Link>}
    </section>
  );
}

// Encart du Duel des Couronnes : le Grimoire (20 cartes) choisi dans le jeu (retenu dans ce navigateur),
// le nombre de cartes et d'objets de pouvoir possédés, et les 3 premières cartes du deck en éventail
function Duel({ duel, deck }) {
  const cles = (() => { const c = lireChoix(); return Array.isArray(c) ? c.slice(0, TAILLE_DECK) : null; })();
  const choisies = cles ? cles.length : null;
  const nbObjets = cles ? cles.filter((k) => String(k).startsWith('o-')).length : 0;
  const main = deck ? deck.ids.filter((id) => id != null).map((id) => deck.cartes.get(id)).filter(Boolean).slice(0, 3) : [];
  return (
    <section id="duel" className="carte duel">
      <div className="duel__texte">
        <span className="duel__sur">Jeu de cartes de Nocthémar</span>
        <h2 className="duel__titre">Duel des Couronnes</h2>
        <p className="duel__accroche" id="duel-accroche">
          {choisies == null
            ? `Ton Grimoire de ${TAILLE_DECK} cartes se construit avec ta collection. Choisis tes cartes dans le jeu et affronte l'Ombre du Codex : chaque coup se joue au d20.`
            : `Ton Grimoire est prêt : ${choisies} carte${choisies > 1 ? 's' : ''} choisie${choisies > 1 ? 's' : ''}${nbObjets ? `, dont ${nbObjets} objet${nbObjets > 1 ? 's' : ''} de pouvoir` : ''}${choisies < TAILLE_DECK ? `, complété par ${TAILLE_DECK - choisies} cartes de base` : ''}. Pose tes unités, sers-toi de tes objets, et que chaque coup se joue au d20.`}
        </p>
        <dl className="duel__stats" id="duel-stats">
          {[['Grimoire', `${TAILLE_DECK} cartes`], ['Cartes', `${duel.nbCartes ?? 0}${duel.nbCatalogue ? ` / ${duel.nbCatalogue}` : ''}`], ['Objets', `${duel.objets} / ${OBJETS.length}`]]
            .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <div className="duel__boutons">
          <Link className="duel__btn duel__btn--plein" to="/duel"><span className="duel__btn-titre">Aller au plateau</span></Link>
        </div>
      </div>
      {/* (dos de carte pour les places vides) */}
      <Link className="duel__eventail" to="/duel" aria-label="Jouer au Duel des Couronnes" id="duel-eventail">
        {[0, 1, 2].map((i) => (main[i] ? <Carte key={i} carte={main[i]} /> : <div key={i} className="carte-jeu carte-jeu--sans-image" />))}
      </Link>
    </section>
  );
}

// Ce qui est privé (mon propre profil) : la bourse, et de quoi remplir l'encart du Duel
async function chargerPrive(discordId) {
  const [{ data: bourse }, { data: inventaire }, { count: nbCartes }, { count: nbCatalogue }] = await Promise.all([
    supabase.from('wallets').select('balance').eq('discord_id', discordId).maybeSingle(),
    supabase.from('inventory').select('item:items(name)').eq('discord_id', discordId),
    supabase.from('player_cards').select('card_id', { count: 'exact', head: true }).eq('discord_id', discordId),
    supabase.from('cards').select('id', { count: 'exact', head: true }).eq('is_available', true),
  ]);
  // Objets de pouvoir possédés, un exemplaire de chacun
  const objets = new Set((inventaire ?? []).map(({ item }) => item && objetDepuisNom(item.name)?.id).filter(Boolean));
  return { solde: bourse?.balance ?? 0, duel: { nbCartes, nbCatalogue, objets: objets.size } };
}

export default function Profil() {
  const { joueur: moi, chargement } = useAuth();
  const [params] = useSearchParams();
  const idVisite = params.get('id');
  const discordId = idVisite || moi?.discord_id || null;
  const estMoi = !!moi && moi.discord_id === discordId;
  const [d, setD] = useState({ pour: null });   // { pour, joueur, badges, prive } ou { pour, introuvable }
  const [ouverte, setOuverte] = useState(null);
  const deck = useDeck(discordId);
  const zoneDeck = useRef(null);

  useEffect(() => {
    if (!discordId || chargement) return undefined;
    let actif = true;
    Promise.all([
      supabase.from('players').select(SELECT_JOUEUR).eq('discord_id', discordId).maybeSingle(),
      supabase.rpc('succes_vitrine', { p_discord_id: discordId }),
      estMoi ? chargerPrive(discordId) : null,
    ]).then(([{ data: joueur, error }, badges, prive]) => {
      if (!actif) return;
      if (error || !joueur) setD({ pour: discordId, introuvable: true });
      else setD({ pour: discordId, joueur, badges: badges.error ? null : badges.data ?? [], prive });
    });
    return () => { actif = false; };
  }, [discordId, estMoi, chargement]);
  const p = discordId && d.pour === discordId ? d : null;
  const j = p?.joueur;

  // Le thème équipé colore toute la page (et s'efface en la quittant)
  const accent = couleur(j?.theme?.payload?.accent);
  const accent2 = couleur(j?.theme?.payload?.accent2) ?? accent;
  useEffect(() => {
    if (!accent) return undefined;
    const racine = document.documentElement.style;
    const corps = document.body.style;
    racine.setProperty('--accent', accent);
    racine.setProperty('--accent2', accent2);
    corps.setProperty('--vif', accent);
    corps.setProperty('--vif2', accent2);
    return () => { ['--accent', '--accent2'].forEach((x) => racine.removeProperty(x)); ['--vif', '--vif2'].forEach((x) => corps.removeProperty(x)); };
  }, [accent, accent2]);

  // Mon deck : je réorganise les cartes en les glissant d'un emplacement à l'autre
  const placer = useRef(null);
  useEffect(() => { placer.current = deck.placer; });
  const deckPret = !!deck.deck && !!j;
  useEffect(() => {
    if (!estMoi || !deckPret || !zoneDeck.current) return undefined;
    return activerGlisser(zoneDeck.current, {
      poignee: '.deck-emplacement .carte-jeu',
      cible: '.deck-emplacement',
      deposer: (carte, cible) => placer.current(Number(carte.dataset.carte), Number(cible.dataset.position)),
    });
  }, [estMoi, deckPret]);

  // Les proportions de la bannière (payload.ratio, ex : « 2172 / 724 ») : le cadre prend la forme de l'image
  const ratio = j?.banner?.payload?.ratio;
  const ratioValide = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(ratio ?? '') ? ratio : undefined;
  const pret = !!p && !p.introuvable && !!deck.deck;

  return (
    <Page id="profil" classes="page-profil page-fiche" titre={j ? (j.username ?? 'Joueur') : 'Profil'}>
      <main className="profil-wrap">
        {(chargement || (discordId && !pret && !p?.introuvable)) && <p id="chargement" className="vide">Chargement du profil…</p>}
        {p?.introuvable && <p id="chargement" className="vide">Joueur introuvable.</p>}

        {/* Pas connecté, et pas de profil demandé */}
        {!chargement && !discordId && (
          <section id="non-connecte" className="carte centre">
            <h2>Ton profil de joueur</h2>
            <p>Connecte-toi avec Discord pour voir ton deck, tes cartes et tes pièces.</p>
            <button id="btn-connexion" type="button" className="btn-discord" onClick={connexionDiscord}>
              <span className="btn-discord__logo" aria-hidden="true" />
              Connecter Discord
            </button>
          </section>
        )}

        {pret && (
          <div id="profil">
            {/* Bandeau du registre (décor) */}
            <p className="fiche-sur" aria-hidden="true"><span />Registre des aventuriers de Nocthémar<span /></p>
            <section className="entete" style={ratioValide ? { aspectRatio: ratioValide } : undefined}>
              <div id="banniere" className="entete__banniere"
                style={j.banner?.payload?.image ? { backgroundImage: `url("${lienSite(j.banner.payload.image)}")` } : undefined} />
              <div className="entete__infos">
                {/* (sans avatar, l'image reste mais cachée : le CSS cache alors le cadre, .entete__medaillon:has(img[hidden])) */}
                <div className="entete__medaillon"><img id="avatar" className="entete__avatar" alt="" src={j.avatar_url ?? undefined} hidden={!j.avatar_url} /></div>
                <div>
                  <h1 id="pseudo">{j.username ?? 'Joueur inconnu'}</h1>
                  <p id="titre" className="entete__titre">{j.title?.payload?.text ?? ''}</p>
                  {/* Profil d'un autre joueur, quand on est connecté : lui proposer un échange de cartes */}
                  {moi && !estMoi && <Link id="lien-echange" className="btn-echange" to={`/marche?avec=${encodeURIComponent(discordId)}`}>⇄ Proposer un échange</Link>}
                </div>
              </div>
            </section>

            <Badges badges={p.badges} estMoi={estMoi} />
            <Rang discordId={discordId} estMoi={estMoi} />

            {/* Vitrine des cartes favorites (le deck du profil) : visible par tous, modifiable seulement sur son propre profil */}
            <section className="carte deck vitrine" ref={zoneDeck}>
              <span className="vitrine__sur">Cartes favorites</span>
              <Deck deck={deck.deck} editable={estMoi} lienAjout="/collection?vue=grimoire"
                surRetirer={deck.retirer} surRenommer={deck.renommer} surLoupe={setOuverte} />
              {estMoi && <Link id="lien-collection" className="btn-collection" to="/collection">Ouvrir ma collection</Link>}
            </section>

            {/* La partie privée : seulement sur mon propre profil */}
            {estMoi && p.prive && <Tresor solde={p.prive.solde} />}
            {estMoi && p.prive && <Duel duel={p.prive.duel} deck={deck.deck} />}
          </div>
        )}
      </main>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
