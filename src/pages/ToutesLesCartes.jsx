// =====================================================================
//  Écran « Toutes les cartes » (ancien toutes-les-cartes.html + JS/toutes-les-cartes.js)
//  - toutes les cartes qui existent dans le jeu ;
//  - celles du joueur connecté : en couleur, « Possédée » (et ×N exemplaires) ; les autres : en gris ;
//  - filtres : recherche par nom, possession (toutes / possédées / manquantes), rareté ;
//  - clic sur une carte : la carte en grand avec son Codex.
// =====================================================================
import { useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import Carte from '../components/Carte.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { sansAccents } from '../data/affichage.js';

const ORDRE = ['transcendante', 'legendaire', 'mythique', 'eveillee', 'commune'];
const rang = (c) => { const i = ORDRE.indexOf(c.rarity); return i < 0 ? ORDRE.length : i; };

const FILTRES_RARETE = [
  ['', 'Toutes'],
  ['transcendante', 'Transcendante'], ['legendaire', 'Légendaire'], ['mythique', 'Mythique'],
  ['eveillee', 'Éveillée'], ['commune', 'Commune'],
];
const AUCUNE = new Map();
const FILTRES_POSSESSION =[['toutes', 'Toutes'], ['possedees', 'Possédées'], ['manquantes', 'Manquantes']];

// Un groupe de boutons « radio » (un seul coché), comme dans l'ancienne page
function GroupeRadio({ className, label, valeurs, choisie, surChoix, attribut, style = () => undefined, cache = false }) {
  return (
    <div className={className} role="radiogroup" aria-label={label} hidden={cache}>
      {valeurs.map(([v, texte]) => (
        <button key={v} type="button" role="radio" aria-checked={v === choisie} {...{ [attribut]: v }}
          style={style(v)} onClick={() => surChoix(v)}>
          {texte}
        </button>
      ))}
    </div>
  );
}

export default function ToutesLesCartes() {
  const { joueur, chargement } = useAuth();
  const [cartes, setCartes] = useState(null);             // null : pas encore chargées
  // Les cartes possédées : id de carte -> nombre d'exemplaires, et le joueur à qui elles sont
  const [collection, setCollection] = useState({ pour: null, cartes: AUCUNE });
  const [texte, setTexte] = useState('');
  const [possession, setPossession] = useState('toutes');
  const [rarete, setRarete] = useState('');
  const [ouverte, setOuverte] = useState(null);           // la carte affichée en grand

  // Le catalogue (une fois) : les vraies cartes du jeu, illustrées, sans la carte d'exemple
  useEffect(() => {
    supabase.from('cards').select('*').eq('is_available', true).order('name').then(({ data }) => {
      setCartes((data ?? [])
        .filter((c) => c.image && c.description !== "Carte d'exemple")
        .sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr')));
    });
  }, []);

  // Les cartes du joueur connecté (chargées de nouveau s'il change), rangées avec son discord_id
  useEffect(() => {
    if (!joueur) return;
    supabase.from('player_cards').select('card_id, quantite').eq('discord_id', joueur.discord_id).then(({ data }) => {
      setCollection({ pour: joueur.discord_id, cartes: new Map((data ?? []).map((p) => [p.card_id, p.quantite ?? 1])) });
    });
  }, [joueur]);

  const connecte = !!joueur;
  // Seulement celles du joueur connecté (rien après une déconnexion)
  const possedees = collection.pour === joueur?.discord_id ? collection.cartes : AUCUNE;
  const pret = cartes !== null && !chargement;
  const recherche = sansAccents(texte.trim());
  const liste = (cartes ?? []).filter((c) => {
    const a = possedees.has(c.id);
    return (!recherche || sansAccents(c.name).includes(recherche))
      && (!rarete || c.rarity === rarete)
      && (possession === 'toutes' || (possession === 'possedees') === a);
  });
  const total = cartes?.length ?? 0;
  const nb = (cartes ?? []).filter((c) => possedees.has(c.id)).length;

  return (
    <Page id="cartes" classes="page-profil page-catalogue" titre="Toutes les cartes" braises>
      <main className="catalogue">

        {/* En-tête : titre et progression (cartes possédées / cartes du jeu) */}
        <header className="catalogue__tete">
          <span className="catalogue__sur">Le bestiaire du Duel des Couronnes</span>
          <h1 className="catalogue__titre">Toutes les cartes</h1>
          <p className="catalogue__intro">Chaque carte qui existe dans le jeu. Celles que tu possèdes brillent de leurs couleurs ; les autres t&apos;attendent encore dans les boosters.</p>
          <div className="catalogue__progression" hidden={!pret || !connecte}>
            <div className="catalogue__compte"><strong>{nb}</strong> / <span>{total}</span> <small>cartes possédées</small></div>
            <div className="catalogue__jauge" aria-hidden="true"><span style={{ width: `${total ? (nb / total) * 100 : 0}%` }} /></div>
          </div>
          <p className="catalogue__connexion" hidden={!pret || connecte}>
            <button type="button" className="catalogue__btn-discord" onClick={() => connexionDiscord()}>Connecte-toi avec Discord</button>
            {' '}pour voir les cartes que tu possèdes.
          </p>
        </header>

        {/* Filtres : recherche, possession, rareté */}
        <div className="catalogue__filtres">
          <input type="search" className="catalogue__recherche" placeholder="Chercher une carte…" aria-label="Chercher une carte"
            value={texte} onChange={(e) => setTexte(e.target.value)} />
          <GroupeRadio className="catalogue__onglets" label="Possession" valeurs={FILTRES_POSSESSION}
            choisie={possession} surChoix={setPossession} attribut="data-possession" cache={!pret || !connecte} />
          <GroupeRadio className="catalogue__raretes" label="Rareté" valeurs={FILTRES_RARETE}
            choisie={rarete} surChoix={setRarete} attribut="data-rarete"
            style={(v) => (v ? { '--c': `var(--rarete-${v})` } : undefined)} />
        </div>

        <div className="catalogue__grille">
          {!pret ? <p className="vide">Les cartes sortent du grimoire…</p>
            : !liste.length ? <p className="vide">Aucune carte ne correspond.</p>
              : liste.map((c) => {
                const n = possedees.get(c.id);
                return (
                  <button key={c.id} type="button" className={`catalogue__carte${connecte && !n ? ' est-manquante' : ''}`}
                    aria-label={`${c.name} : voir la carte`} onClick={() => setOuverte(c)}>
                    <Carte carte={c} />
                    {connecte && (n
                      ? <span className="catalogue__statut catalogue__statut--oui">Possédée{n > 1 && <> <b>×{n}</b></>}</span>
                      : <span className="catalogue__statut">Pas encore obtenue</span>)}
                  </button>
                );
              })}
        </div>
      </main>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
