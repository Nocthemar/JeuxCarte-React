// =====================================================================
//  Écran « Boutique » (ancien boutique.html + JS/boutique*.js)
//  Quatre échoppes :
//   I.   les boosters de cartes, et l'offrande gratuite (components/boutique/Boosters.jsx) ;
//   II.  l'étal du marchand ambulant, renouvelé par le bot toutes les 5 h ;
//   III. l'armoire des apparences (bannières, titres, thèmes) ;
//   IV.  l'atelier des plateaux du Duel (components/boutique/Etals.jsx).
//  La bourse (solde) est en haut ; après chaque achat, tout est rechargé (le solde est commun).
//  À droite, le sommaire met en avant l'échoppe qui occupe le milieu de l'écran.
// =====================================================================
import { useEffect, useState } from 'react';
import Page from '../components/Page.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import Boosters from '../components/boutique/Boosters.jsx';
import { EtalMarchand, ArmoireProfil, AtelierPlateaux } from '../components/boutique/Etals.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { urlPublique } from '../lib/chemins.js';

const ECHOPPES = [
  ['porte-cartes', 'I', 'Boosters'],
  ['etal-marchand', 'II', 'Le marchand'],
  ['armoire-apparences', 'III', 'Apparences'],
  ['atelier-plateaux', 'IV', 'Plateaux'],
];
const AUCUN = new Set();

// Le solde et les objets possédés du joueur connecté
async function chargerCompte(discordId) {
  const [{ data: bourse }, { data: inventaire }] = await Promise.all([
    supabase.from('wallets').select('balance').eq('discord_id', discordId).maybeSingle(),
    supabase.from('inventory').select('item_id').eq('discord_id', discordId),
  ]);
  return { solde: bourse?.balance ?? 0, possedes: new Set((inventaire ?? []).map((l) => l.item_id)) };
}

// Une enseigne d'échoppe
function Enseigne({ num, sur, titre }) {
  return (
    <div className="enseigne">
      <span className="enseigne__num">{num}</span>
      <span className="enseigne__sur">{sur}</span>
      <h2>{titre}</h2>
    </div>
  );
}

export default function Boutique() {
  const { joueur } = useAuth();
  const discordId = joueur?.discord_id ?? null;
  const [version, setVersion] = useState(0);         // change après chaque achat : tout se recharge
  const [compte, setCompte] = useState({ pour: null });
  const [ouverte, setOuverte] = useState(null);      // la carte affichée en grand
  const [visible, setVisible] = useState(null);      // l'échoppe au milieu de l'écran
  const rafraichir = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    chargerCompte(discordId).then((c) => { if (actif) setCompte({ pour: discordId, ...c }); });
    return () => { actif = false; };
  }, [discordId, version]);
  const c = discordId && compte.pour === discordId ? compte : { solde: 0, possedes: AUCUN };

  // Sommaire : l'échoppe qui occupe le milieu de l'écran est mise en avant
  useEffect(() => {
    const surveillance = new IntersectionObserver((entrees) => {
      for (const e of entrees) if (e.isIntersecting) setVisible(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    ECHOPPES.forEach(([id]) => { const s = document.getElementById(id); if (s) surveillance.observe(s); });
    return () => surveillance.disconnect();
  }, []);

  const props = { moi: joueur, solde: c.solde, possedes: c.possedes, version, rafraichir };

  return (
    <Page id="boutique" classes="page-profil page-boutique" titre="Boutique">
      <main className="profil-wrap marche">
        <header className="boutique-entete">
          <h1>Le Marché de Nocthémar</h1>
          <p>Tout ce qui se vend ici est cosmétique ou narratif. Les pièces se gagnent en jouant, jamais en payant.</p>
        </header>

        {/* Échoppe I : boosters de cartes (achat et ouverture) */}
        <section className="echoppe" id="porte-cartes">
          {/* Solde (connecté), dans le coin de l'échoppe */}
          <div id="bourse" className="bourse" hidden={!joueur}>
            <img className="bourse__piece" src={urlPublique('img/Equipement/Or-icone.webp')} alt="" />
            <div className="bourse__texte">
              <span className="bourse__libelle">Ta bourse</span>
              <strong><span id="solde">{c.solde.toLocaleString('fr-FR')}</span> <small>pièces</small></strong>
            </div>
          </div>
          <Enseigne num="I" sur="Boosters de cartes" titre="La porte aux mille cartes" />
          <p className="echoppe__intro">Chaque booster renferme des cartes tirées au hasard. Tape sur la porte pour la briser : sa lumière trahit la rareté qui t&apos;attend.</p>
          <Boosters {...props} surApercu={setOuverte} />
        </section>

        {/* Échoppe II : sélection du marchand, renouvelée par le bot */}
        <section className="echoppe" id="etal-marchand">
          <Enseigne num="II" sur="Boutique du marchand" titre="L'étal du marchand ambulant" />
          <p className="echoppe__intro">Renouvelé toutes les 5 heures. Stock limité : premier arrivé, premier servi.</p>
          <EtalMarchand {...props} />
        </section>

        {/* Échoppe III : cosmétiques du profil */}
        <section className="echoppe" id="armoire-apparences">
          <Enseigne num="III" sur="Boutique du profil" titre="L'armoire des apparences" />
          <p className="echoppe__intro">Bannières, titres et thèmes pour ton profil. Une fois acheté, équipe-le depuis ton profil.</p>
          <ArmoireProfil {...props} />
        </section>

        {/* Échoppe IV : plateaux du Duel des Couronnes */}
        <section className="echoppe" id="atelier-plateaux">
          <Enseigne num="IV" sur="Plateaux de duel" titre="L'atelier des plateaux" />
          <p className="echoppe__intro">Sans plateau choisi, tu joues sur l&apos;arène de pierre. Achète un plateau des saisons pour en changer ; choisis-le quand tu veux dans la roue de ta Collection.</p>
          <AtelierPlateaux {...props} />
        </section>
      </main>

      {/* Sommaire : aller directement à une échoppe */}
      <nav className="sommaire" id="sommaire" aria-label="Échoppes de la boutique">
        {ECHOPPES.map(([id, num, nom]) => (
          <a key={id} href={`#${id}`} className={visible === id ? 'est-actif' : undefined} aria-current={visible === id ? 'location' : undefined}
            onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView(); }}>
            <span className="sommaire__num">{num}</span><span className="sommaire__nom">{nom}</span>
          </a>
        ))}
      </nav>

      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
