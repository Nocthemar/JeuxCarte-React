// =====================================================================
//  Écran « Boutique » : un hall et trois échoppes, dans le style de l'accueil du Duel
//  (styles/boutique-vitrine.css : la mise en page ; boutique-accueil.css : l'allure, choisie le 20/10/2026)
//   - le hall (#/boutique) : trois grandes portes, une par échoppe, avec ce qui attend le joueur
//     (offrande prête, boosters à ouvrir) ;
//   - une échoppe (#/boutique?echoppe=boosters…) : ses articles, et des onglets pour passer aux autres.
//  Les échoppes :
//   I.   les boosters de cartes, l'offrande gratuite (components/boutique/Boosters.jsx), et les badges de la
//        Caverne aux Trésors (components/boutique/EtalBadges.jsx) ;
//   II.  l'armoire des apparences (bannières, titres, thèmes) ;
//   III. l'atelier des plateaux du Duel (components/boutique/Etals.jsx).
//  (L'étal du marchand ambulant a été retiré du jeu le 20/10/2026 ; sa table daily_shop reste en base,
//  le bot Discord et le site Nocthémar s'en servent.)
//  La bourse (solde) reste en haut ; après chaque achat, tout est rechargé (le solde est commun).
//  (La Caverne aux Trésors s'ouvre depuis la barre latérale.)
// =====================================================================
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Boosters from '../components/boutique/Boosters.jsx';
import EtalBadges from '../components/boutique/EtalBadges.jsx';
import { ArmoireProfil, AtelierPlateaux } from '../components/boutique/Etals.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { urlPublique } from '../lib/chemins.js';

const ECHOPPES = [
  {
    id: 'boosters', num: 'I', court: 'Boosters', sur: 'Boosters de cartes', titre: 'La porte aux mille cartes',
    porte: 'Des cartes tirées au hasard, une offrande toutes les 10 minutes, et les badges de la Caverne.',
    intro: 'Chaque booster renferme des cartes tirées au hasard. Tape sur la porte pour la briser : sa lumière trahit la rareté qui t\'attend.',
  },
  {
    id: 'apparences', num: 'II', court: 'Apparences', sur: 'Bannières, titres, thèmes', titre: 'L\'armoire des apparences',
    porte: 'Pare ton profil : bannières, titres et thèmes de couleurs.',
    intro: 'Bannières, titres et thèmes pour ton profil. Une fois acheté, équipe-le depuis ton profil.',
  },
  {
    id: 'plateaux', num: 'III', court: 'Plateaux', sur: 'Plateaux de duel', titre: 'L\'atelier des plateaux',
    porte: 'Change d\'arène : les plateaux des saisons pour tes duels.',
    intro: 'Sans plateau choisi, tu joues sur l\'arène de pierre. Achète un plateau des saisons pour en changer ; choisis-le quand tu veux dans la roue de ta Collection.',
  },
];
const AUCUN = new Set();

const img = (chemin) => urlPublique(`img/${chemin}`);

// Le solde et les objets possédés du joueur connecté
async function chargerCompte(discordId) {
  const [{ data: bourse }, { data: inventaire }] = await Promise.all([
    supabase.from('wallets').select('balance').eq('discord_id', discordId).maybeSingle(),
    supabase.from('inventory').select('item_id').eq('discord_id', discordId),
  ]);
  return { solde: bourse?.balance ?? 0, possedes: new Set((inventaire ?? []).map((l) => l.item_id)) };
}

// Ce que le hall annonce sur la porte des boosters : l'offrande prête, les boosters à ouvrir
async function chargerHall(moi) {
  if (!moi) return null;
  const [gratuit, mesBoosters] = await Promise.all([
    supabase.rpc('booster_gratuit_etat'),
    supabase.from('player_boosters').select('quantite').eq('discord_id', moi.discord_id),
  ]);
  return {
    offrande: gratuit.error ? null : Date.now() + (gratuit.data?.secondes ?? 0) * 1000,
    aOuvrir: (mesBoosters.data ?? []).reduce((n, l) => n + (l.quantite ?? 0), 0),
  };
}

// L'heure, mise à jour régulièrement (l'offrande devient prête pendant qu'on regarde le hall)
function useMaintenant(ms) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setT(Date.now()), ms);
    return () => clearInterval(minuteur);
  }, [ms]);
  return t;
}

// ---------------------------------------------------------------------
//  Le hall : une porte par échoppe, avec une petite scène qui montre ce qu'on y trouve
// ---------------------------------------------------------------------
function Scene({ id }) {
  if (id === 'boosters') {
    return (
      <div className="scene scene--boosters" aria-hidden="true">
        {[-1, 0, 1].map((k) => <img key={k} className="scene__dos" src={img('Cartes/Verso-gris.webp')} alt="" style={{ '--k': k }} />)}
        <img className="scene__booster" src={img('Booster/Booster.webp')} alt="" />
      </div>
    );
  }
  if (id === 'apparences') {
    return (
      <div className="scene scene--apparences" aria-hidden="true">
        <div className="scene__blason">
          <span className="scene__titre">« Le Brave »</span>
          <span className="scene__couleurs">
            {['#d0612a', '#ffd27a', '#6f8fd8', '#9a5fc0'].map((c) => <i key={c} style={{ '--c': c }} />)}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="scene scene--plateaux" aria-hidden="true">
      <img className="scene__plateau scene__plateau--fond" src={img('Plateaux de carte/plateau-automne-mini.webp')} alt="" />
      <img className="scene__plateau" src={img('Plateaux de carte/plateau-hiver-mini.webp')} alt="" />
    </div>
  );
}

function Hall({ moi, version }) {
  const [etat, setEtat] = useState(null);
  const maintenant = useMaintenant(1000);
  useEffect(() => {
    let actif = true;
    chargerHall(moi).then((e) => { if (actif) setEtat(e); });
    return () => { actif = false; };
  }, [moi, version]);

  // La petite annonce de la porte des boosters
  const annonce = (id) => {
    if (!etat || id !== 'boosters') return null;
    if (etat.offrande !== null && etat.offrande <= maintenant) return { texte: 'Offrande prête !', vive: true };
    if (etat.aOuvrir > 0) return { texte: `${etat.aOuvrir} à ouvrir`, vive: true };
    return null;
  };

  return (
    <nav className="hall" aria-label="Échoppes de la boutique">
      {ECHOPPES.map((e) => {
        const a = annonce(e.id);
        return (
          <Link key={e.id} to={{ search: `?echoppe=${e.id}` }} className={`porte porte--${e.id}`} data-echoppe={e.id}>
            <Scene id={e.id} />
            <span className="porte__texte">
              <span className="porte__num">{e.num} · {e.sur}</span>
              <span className="porte__titre">{e.titre}</span>
              <span className="porte__desc">{e.porte}</span>
              <span className="porte__entrer">Entrer <span aria-hidden="true">→</span></span>
            </span>
            {a && <span className={`porte__annonce${a.vive ? ' porte__annonce--vive' : ''}`}>{a.texte}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Boutique() {
  const { joueur } = useAuth();
  const discordId = joueur?.discord_id ?? null;
  const [params] = useSearchParams();
  const ici = ECHOPPES.find((e) => e.id === params.get('echoppe')) ?? null;
  const [version, setVersion] = useState(0);         // change après chaque achat : tout se recharge
  const [compte, setCompte] = useState({ pour: null });
  const rafraichir = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    chargerCompte(discordId).then((c) => { if (actif) setCompte({ pour: discordId, ...c }); });
    return () => { actif = false; };
  }, [discordId, version]);
  const c = discordId && compte.pour === discordId ? compte : { solde: 0, possedes: AUCUN };

  // En passant du hall à une échoppe (ou d'une échoppe à l'autre) : on remonte en haut
  useEffect(() => { window.scrollTo(0, 0); }, [ici]);

  const props = { moi: joueur, solde: c.solde, possedes: c.possedes, version, rafraichir };

  return (
    <Page id="boutique" classes="page-profil page-boutique" titre="Boutique">
      <main className="profil-wrap vitrine vitrine--accueil">
        <header className="vitrine-entete">
          <div className="vitrine-entete__titre">
            {ici && <Link className="vitrine-retour" to="/boutique"><span aria-hidden="true">←</span> Le hall</Link>}
            <h1>Le Marché de <span>Nocthémar</span></h1>
          </div>
          {/* Solde du joueur connecté */}
          <div id="bourse" className="bourse" hidden={!joueur}>
            <img className="bourse__piece" src={img('Equipement/Or-icone.webp')} alt="" />
            <span className="bourse__texte">
              <span className="bourse__libelle">Ta bourse</span>
              <strong><span id="solde">{c.solde.toLocaleString('fr-FR')}</span> <small>pièces</small></strong>
            </span>
          </div>
        </header>

        {!ici ? (
          <Hall moi={joueur} version={version} />
        ) : (
          <>
            {/* Passer d'une échoppe à l'autre sans revenir au hall */}
            <nav className="onglets" aria-label="Échoppes">
              {ECHOPPES.map((e) => (
                <Link key={e.id} to={{ search: `?echoppe=${e.id}` }} className={`onglet${e.id === ici.id ? ' est-actif' : ''}`}
                  aria-current={e.id === ici.id ? 'page' : undefined}>
                  <span className="onglet__num">{e.num}</span> {e.court}
                </Link>
              ))}
            </nav>

            <section className={`echoppe echoppe--${ici.id}`} id={`echoppe-${ici.id}`} aria-labelledby="echoppe-titre">
              <header className="echoppe__entete">
                <span className="echoppe__sur">{ici.num} · {ici.sur}</span>
                <h2 id="echoppe-titre">{ici.titre}</h2>
                <p className="echoppe__intro">{ici.intro}</p>
              </header>
              {ici.id === 'boosters' && <><Boosters {...props} /><EtalBadges {...props} /></>}
              {ici.id === 'apparences' && <ArmoireProfil {...props} />}
              {ici.id === 'plateaux' && <AtelierPlateaux {...props} />}
            </section>
          </>
        )}
      </main>

    </Page>
  );
}
