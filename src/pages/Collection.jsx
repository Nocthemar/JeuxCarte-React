// =====================================================================
//  Écran « Collection » (ancien collection.html + JS/collection.js + JS/collection-roue.js)
//  Deux choix :
//  - ouvrir le grimoire : les cartes du joueur, rangées dans des pochettes, et le deck du profil
//    (components/collection/VueGrimoire.jsx) ; #/collection?vue=grimoire l'ouvre d'office ;
//  - ouvrir la roue des apparences : plateaux, thèmes, titres, bannières (components/collection/Roue.jsx) ;
//    #/collection?vue=roue l'ouvre d'office.
//  Les échanges entre joueurs sont sur l'écran Marché ; l'ancien lien ?avec=<discord_id> y mène.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import VueGrimoire from '../components/collection/VueGrimoire.jsx';
import Roue from '../components/collection/Roue.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useDeck } from '../lib/deck.js';

const VUES = {
  grimoire: { fermer: '← Refermer le grimoire' },
  roue: { fermer: '← Refermer la roue' },
};
// Les colonnes de players qui disent ce qui est équipé
const CHAMP = { banner: 'banner_item_id', title: 'title_item_id', theme: 'theme_item_id' };

// « Bannière « Les Veines » » -> « Les Veines »
const nomCourt = (nom) => String(nom ?? '').replace(/^(bannière|thème|titre)\s*«\s*(.+?)\s*»$/i, '$2');

// Les cartes du joueur, avec leur nombre d'exemplaires (1 si la colonne quantite n'existe pas encore)
async function lireCartes(discordId) {
  const avec = await supabase.from('player_cards').select('page, slot, quantite, card:cards(*)').eq('discord_id', discordId);
  if (!avec.error) return avec;
  return supabase.from('player_cards').select('page, slot, card:cards(*)').eq('discord_id', discordId);
}

// Ce que le joueur possède pour la roue : objets de l'inventaire, plateaux achetés (et celui choisi)
async function lireApparences(discordId) {
  const [{ data: inventaire }, { data: plateaux }] = await Promise.all([
    supabase.from('inventory').select('item:items(*)').eq('discord_id', discordId),
    supabase.from('joueur_plateaux').select('equipe, plateau:plateaux(id, nom, image, miniature, ordre)').eq('discord_id', discordId),
  ]);
  const objets = { plateau: [], theme: [], title: [], banner: [] };
  for (const { item } of inventaire ?? []) {
    if (!item || !CHAMP[item.kind] || objets[item.kind].some((o) => o.id === item.id)) continue;
    objets[item.kind].push({ kind: item.kind, id: item.id, nom: nomCourt(item.name), payload: item.payload ?? {} });
  }
  const achetes = (plateaux ?? []).filter((l) => l.plateau).sort((a, b) => a.plateau.ordre - b.plateau.ordre);
  objets.plateau = [
    { kind: 'plateau', id: null, nom: 'Plateau par défaut', defaut: true, image: 'img/Plateaux de carte/plateau-defaut-mini.webp' },
    ...achetes.map(({ plateau: p }) => ({ kind: 'plateau', id: p.id, nom: p.nom, image: p.miniature ?? p.image })),
  ];
  return { objets, plateauChoisi: achetes.find((l) => l.equipe)?.plateau.id ?? null };
}

async function charger(discordId) {
  const [{ data, error }, apparences] = await Promise.all([
    lireCartes(discordId),
    lireApparences(discordId).catch((e) => { console.error(e); return null; }),
  ]);
  if (error) return { erreur: true };
  const cartes = new Map();
  for (const { page, slot, quantite, card } of data ?? []) if (card) cartes.set(card.id, { carte: card, page, slot, quantite: quantite ?? 1 });
  return { cartes, apparences };
}

export default function Collection() {
  const { joueur, chargement } = useAuth();
  const [params, setParams] = useSearchParams();
  const naviguer = useNavigate();
  const discordId = joueur?.discord_id ?? null;
  // Les données, rangées avec le joueur à qui elles sont (un autre compte : on recharge)
  const [donnees, setDonnees] = useState({ pour: null });
  const [equipes, setEquipes] = useState({ pour: null });   // ce qui a été équipé depuis l'ouverture
  const [anime, setAnime] = useState(false);                // le grimoire / la roue s'ouvre avec une animation
  const [ouverte, setOuverte] = useState(null);             // la carte affichée en grand
  const deck = useDeck(discordId);
  const boutonLivre = useRef(null);
  const boutonRoue = useRef(null);

  // Ancien lien d'échange (?avec=…) : les échanges sont sur l'écran Marché
  const avec = params.get('avec');
  useEffect(() => {
    if (avec) naviguer(`/marche?avec=${encodeURIComponent(avec)}`, { replace: true });
  }, [avec, naviguer]);

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    charger(discordId).then((d) => { if (actif) setDonnees({ pour: discordId, ...d }); });
    return () => { actif = false; };
  }, [discordId]);

  const d = discordId && donnees.pour === discordId ? donnees : null;
  const vue = VUES[params.get('vue')] ? params.get('vue') : null;
  const majCartes = (fn) => setDonnees((x) => ({ ...x, cartes: fn(x.cartes) }));

  // Ce qui est équipé : la fiche du joueur et son plateau, puis les changements faits sur la roue
  const equipesBase = d?.apparences ? {
    plateau: d.apparences.plateauChoisi, theme: joueur[CHAMP.theme] ?? null, title: joueur[CHAMP.title] ?? null, banner: joueur[CHAMP.banner] ?? null,
  } : null;
  const equipesActuels = equipes.pour === discordId ? { ...equipesBase, ...equipes.valeurs } : equipesBase;
  const surEquiper = (kind, id) => setEquipes((e) => ({ pour: discordId, valeurs: { ...(e.pour === discordId ? e.valeurs : {}), [kind]: id } }));

  // Les deux choix : le grimoire ou la roue s'ouvre (et se referme) à la place de l'écran de choix
  const ouvrir = (nom) => {
    setAnime(true);
    setParams({ vue: nom }, { replace: true });
    scrollTo(0, 0);
  };
  const fermer = () => {
    const nom = vue;
    setParams({}, { replace: true });
    scrollTo(0, 0);
    setTimeout(() => (nom === 'roue' ? boutonRoue : boutonLivre).current?.focus(), 0);
  };

  const nbCartes = d?.cartes?.size ?? 0;
  const nbApparences = d?.apparences ? Object.values(d.apparences.objets).reduce((t, l) => t + l.length, 0) : null;
  const pret = !!d && !d.erreur && !!deck.deck;

  return (
    <Page id="collection" classes="page-profil page-collection" titre="Collection" braises>
      <main className="collection-wrap">
        <Link className="retour" to="/profil">← Retour au profil</Link>
        {/* Grimoire ou roue ouverts : on revient aux deux choix */}
        {vue && pret && <button type="button" className="retour retour--bouton" id="btn-fermer" onClick={fermer}>{VUES[vue].fermer}</button>}

        {(chargement || (joueur && !pret && !d?.erreur)) && <p id="chargement" className="vide">Ouverture de ta collection…</p>}
        {d?.erreur && <p id="chargement" className="vide">Impossible d&apos;ouvrir le grimoire pour l&apos;instant.</p>}

        {/* Pas connecté */}
        {!chargement && !joueur && (
          <section id="non-connecte" className="carte centre">
            <h2>Ton grimoire de cartes</h2>
            <p>Connecte-toi avec Discord pour ouvrir ta collection de cartes.</p>
            <button id="btn-connexion" type="button" className="btn-discord" onClick={() => connexionDiscord()}>
              <span className="btn-discord__logo" aria-hidden="true" />
              Connecter Discord
            </button>
          </section>
        )}

        {/* Deux choix : ouvrir le grimoire (les cartes), ou tourner la roue des apparences */}
        {pret && !vue && (
          <section id="choix" className="choix">
            <h1 className="choix__titre">Ta collection</h1>
            <div className="choix__grille">
              {/* I. Le grimoire, fermé : on l'ouvre pour voir ses cartes */}
              <button type="button" className="choix-livre" id="btn-ouvrir-livre" aria-describedby="livre-aide" ref={boutonLivre} onClick={() => ouvrir('grimoire')}>
                <span className="choix-livre__livre" aria-hidden="true">
                  <span className="choix-livre__tranche" />
                  <span className="choix-livre__couverture">
                    <span className="choix-livre__cadre" />
                    <span className="choix-livre__embleme">✦</span>
                    <span className="choix-livre__nom">Grimoire<br />des cartes</span>
                    <span className="choix-livre__compte" id="livre-compte">{nbCartes} carte{nbCartes > 1 ? 's' : ''}</span>
                  </span>
                </span>
                <span className="choix__libelle">Ouvrir le grimoire</span>
                <small className="choix__aide" id="livre-aide">Tes cartes collectionnées et ton deck</small>
              </button>

              {/* II. La roue des apparences, fermée : on l'ouvre pour la faire tourner en grand */}
              <button type="button" className="choix-roue" id="btn-ouvrir-roue" aria-describedby="roue-medaillon-aide" ref={boutonRoue} onClick={() => ouvrir('roue')}>
                <span className="medaillon" aria-hidden="true">
                  <span className="medaillon__rayons" />
                  <span className="medaillon__signe medaillon__signe--1">▣</span>
                  <span className="medaillon__signe medaillon__signe--2">◐</span>
                  <span className="medaillon__signe medaillon__signe--3">❝</span>
                  <span className="medaillon__signe medaillon__signe--4">⚑</span>
                  <span className="medaillon__coeur">✦</span>
                </span>
                <span className="choix__libelle">La roue des apparences</span>
                <small className="choix__aide" id="roue-medaillon-aide">
                  Plateaux, thèmes, titres et bannières : <span id="roue-compte">{nbApparences == null ? '…' : `${nbApparences} objet${nbApparences > 1 ? 's' : ''}`}</span>
                </small>
              </button>
            </div>
            {/* Les échanges entre joueurs (contrats à sceaux) sont sur l'écran Marché */}
            <Link className="choix__echanges" to="/marche?onglet=echanges">⇄ Échanger avec un joueur</Link>
          </section>
        )}

        {pret && vue === 'roue' && (d.apparences
          ? <Roue objets={d.apparences.objets} equipes={equipesActuels} surEquiper={surEquiper} anime={anime} />
          : (
            <section id="vue-roue" className="vue-roue">
              <h1 className="choix__titre" id="roue-titre">La roue des apparences</h1>
              <div className="roue__centre"><span className="roue__vide">Impossible de charger ta collection.</span></div>
            </section>
          ))}

        {pret && vue === 'grimoire' && (
          <VueGrimoire moi={joueur} cartes={d.cartes} majCartes={majCartes} deck={deck} surLoupe={setOuverte} anime={anime} />
        )}
      </main>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
