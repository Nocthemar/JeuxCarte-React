// =====================================================================
//  Écran « Profil » (ancien profil.html + JS/profil.js, refait en écran de personnage en octobre 2026), consacré au Duel des Couronnes
//  #/profil           -> mon profil, en « écran de personnage » (styles/profil-heros.css) : une grande bannière avec
//                        le héros et son rang, puis trésor, hauts faits, registre, puis cartes favorites et collection
//  #/profil?id=12345  -> le profil public d'un autre joueur (ID Discord) : badges, rang, deck en lecture seule,
//                        et « Proposer un échange »
//  Le thème équipé par le joueur colore toute la page (accents --accent, --vif).
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Deck from '../components/Deck.jsx';
import Badge from '../components/Badge.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import { PlaqueRang, Registre } from '../components/profil/Rang.jsx';
import { useRang } from '../lib/rang.js';
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
import { RARETES, rareteDe } from '../data/affichage.js';
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
// Sur son propre profil sans badge : un lien pour les choisir. Ailleurs sans badge : rien.
function Badges({ badges, estMoi }) {
  if (!badges || (!badges.length && !estMoi)) return null;
  return (
    <section id="badges-profil" className="heros-panneau heros-badges" aria-labelledby="titre-badges">
      <h2 className="heros-titre" id="titre-badges">Hauts faits</h2>
      <div id="badges" className="heros-badges__liste">
        {badges.length ? badges.map((s) => (
          <div key={s.id} className="heros-badge" title={s.description}>
            <Badge s={s} taille="grand" />
            <span>
              <strong>{s.nom}</strong>
              <span className={`rarete-succes rarete-succes--${s.rarete}`}>{RARETES_SUCCES[s.rarete]?.nom ?? 'Commun'}</span>
              <small>{pourcentageTexte(s.pourcentage)} des joueurs</small>
            </span>
          </div>
        )) : <p className="vide">Aucun badge épinglé pour le moment.</p>}
      </div>
      {estMoi && <Link id="lien-succes" className="heros-lien" to="/succes">{badges.length ? 'Changer mes badges' : 'Choisir mes badges'}</Link>}
    </section>
  );
}

// Ce qui est privé (mon propre profil) : la bourse, de quoi remplir l'encart du Duel, et la collection
// par rareté (mes cartes ne sont lisibles que par moi)
async function chargerPrive(discordId) {
  const [{ data: bourse }, { data: inventaire }, { data: mesCartes }, { data: catalogue }] = await Promise.all([
    supabase.from('wallets').select('*').eq('discord_id', discordId).maybeSingle(),
    supabase.from('inventory').select('item:items(name)').eq('discord_id', discordId),
    supabase.from('player_cards').select('card:cards(rarity)').eq('discord_id', discordId),
    supabase.from('cards').select('rarity').eq('is_available', true),
  ]);
  // Objets de pouvoir possédés, un exemplaire de chacun
  const objets = new Set((inventaire ?? []).map(({ item }) => item && objetDepuisNom(item.name)?.id).filter(Boolean));
  // La collection : par rareté, [cartes possédées, cartes du catalogue]
  const collection = Object.fromEntries(Object.keys(RARETES).map((r) => [r, [0, 0]]));
  (catalogue ?? []).forEach((c) => { collection[rareteDe(c)][1] += 1; });
  (mesCartes ?? []).forEach(({ card }) => { if (card) collection[rareteDe(card)][0] += 1; });
  const nbCartes = mesCartes?.length ?? 0;
  const nbCatalogue = catalogue?.length ?? 0;
  return { solde: bourse?.balance ?? 0, cristaux: bourse?.cristaux ?? 0, duel: { nbCartes, nbCatalogue, objets: objets.size }, collection };
}

// Ma collection, rareté par rareté (un anneau qui se remplit, « possédées / existantes »), et le
// Duel des Couronnes : le Grimoire (20 cartes) choisi dans le jeu (retenu dans ce navigateur), les objets
// de pouvoir possédés, et les boutons pour ouvrir la collection et aller jouer
function Collection({ collection, duel }) {
  const [possedees, total] = Object.values(collection).reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
  const cles = (() => { const c = lireChoix(); return Array.isArray(c) ? c.slice(0, TAILLE_DECK) : null; })();
  const choisies = cles ? cles.length : null;
  const nbObjets = cles ? cles.filter((k) => String(k).startsWith('o-')).length : 0;
  const grimoire = choisies == null
    ? `Ton Grimoire de ${TAILLE_DECK} cartes se construit avec ta collection.`
    : `Grimoire prêt : ${choisies} carte${choisies > 1 ? 's' : ''} choisie${choisies > 1 ? 's' : ''}${nbObjets ? `, dont ${nbObjets} objet${nbObjets > 1 ? 's' : ''} de pouvoir` : ''}${choisies < TAILLE_DECK ? `, complété par ${TAILLE_DECK - choisies} cartes de base` : ''}.`;
  return (
    <section id="duel" className="heros-panneau heros-collection" aria-labelledby="titre-collection">
      <h2 className="heros-titre" id="titre-collection">Collection <span>{possedees} / {total}</span></h2>
      <ul className="heros-collection__liste">
        {Object.entries(collection).map(([r, [x, y]]) => (
          <li key={r} className={`heros-anneau heros-anneau--${r}`} style={{ '--pct': `${y ? (x / y) * 100 : 0}%` }}
            title={`${RARETES[r]} : ${x} sur ${y}`}>
            <span className="heros-anneau__cercle"><b>{x}</b><small>/ {y}</small></span>
            <span className="heros-anneau__nom">{RARETES[r]}</span>
          </li>
        ))}
      </ul>
      <p className="heros-collection__grimoire" id="duel-accroche">
        {grimoire} <span id="duel-stats">Objets de pouvoir : {duel.objets} / {OBJETS.length}.</span>
      </p>
      <div className="heros-collection__boutons">
        <Link id="lien-collection" className="heros-jouer" to="/collection">Ouvrir ma collection</Link>
        <Link className="heros-jouer heros-jouer--sobre" to="/duel">Aller au plateau</Link>
      </div>
    </section>
  );
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
  const rang = useRang(discordId);
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
            <button id="btn-connexion" type="button" className="btn-discord" onClick={() => connexionDiscord()}>
              <span className="btn-discord__logo" aria-hidden="true" />
              Connecter Discord
            </button>
          </section>
        )}

        {/* L'écran du personnage (styles/profil-heros.css) : en haut, la bannière en grand, immersive, avec le
            héros (médaillon, nom, titre) en bas à gauche et son rang en haut à droite ; dessous, une rangée trésor,
            hauts faits, registre des duels ; enfin les cartes favorites et la collection (avec le Duel des Couronnes) */}
        {pret && (
          <div id="profil" className="ecran-heros">
            <header className="heros-bandeau">
              <div id="banniere" className="heros-bandeau__image"
                style={j.banner?.payload?.image ? { backgroundImage: `url("${lienSite(j.banner.payload.image)}")` } : undefined} />
              <div className="heros-bandeau__rang">
                <PlaqueRang rang={rang?.rang} />
                {/* Mon profil : changer de bannière, de titre ou de thème (l'armoire de la Boutique) */}
                {estMoi && <Link className="heros-bandeau__armoire" to="/boutique?echoppe=apparences" title="Changer de bannière, de titre ou de thème">Apparence</Link>}
              </div>
              <div className="heros-bandeau__contenu">
                {/* (sans avatar, l'image reste mais cachée : le CSS cache alors le médaillon) */}
                <div className="heros-bandeau__medaillon"><img id="avatar" alt="" src={j.avatar_url ?? undefined} hidden={!j.avatar_url} /></div>
                <div className="heros-bandeau__identite">
                  <h1 id="pseudo" className="heros-bandeau__nom">{j.username ?? 'Joueur inconnu'}</h1>
                  <p id="titre" className="heros-bandeau__titre">{j.title?.payload?.text ?? ''}</p>
                  {/* Profil d'un autre joueur, quand on est connecté : lui proposer un échange de cartes */}
                  {moi && !estMoi && <Link id="lien-echange" className="heros-jouer heros-jouer--sobre" to={`/marche?avec=${encodeURIComponent(discordId)}`}>⇄ Proposer un échange</Link>}
                </div>
              </div>
            </header>

            <div className="heros-rangee heros-rangee--infos">
              {/* La bourse : seulement sur mon propre profil */}
              {estMoi && p.prive && <section className="heros-panneau heros-rangee__tresor" aria-label="Le trésor"><Tresor solde={p.prive.solde} cristaux={p.prive.cristaux} /></section>}
              <Badges badges={p.badges} estMoi={estMoi} />
              {rang && ((!rang.stats.error && rang.stats.data) || estMoi) && (
                <section className="heros-panneau heros-rangee__registre" aria-labelledby="titre-registre">
                  <h2 className="heros-titre" id="titre-registre">Registre des duels</h2>
                  <Registre d={rang} estMoi={estMoi} />
                </section>
              )}
            </div>

            <div className="heros-rangee heros-rangee--cartes">
              {/* Les cartes favorites (le deck du profil) : visibles par tous, modifiables seulement sur son propre profil */}
              <section className="heros-panneau heros-deck" ref={zoneDeck} aria-label="Cartes favorites">
                <Deck deck={deck.deck} editable={estMoi} lienAjout="/collection?vue=grimoire"
                  surRetirer={deck.retirer} surRenommer={deck.renommer} surLoupe={setOuverte} />
              </section>
              {estMoi && p.prive && <Collection collection={p.prive.collection} duel={p.prive.duel} />}
            </div>
          </div>
        )}
      </main>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
