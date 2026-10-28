// =====================================================================
//  Écran « La Caverne aux Trésors » (#/caverne) : quatre jeux de hasard, avec l'or ou les cristaux du jeu.
//   I.   Le Dragon Dormant : voler l'or avant son réveil ;
//   II.  Les Bourses du Marchand : éviter les bourses piégées ;
//   III. Le Pont Maudit : traverser avant que ça cède ;
//   IV.  Le Lac des Esprits : remonter la ligne, seule la tension trahit la prise.
//  Le serveur (supabase/caverne.sql) prend la mise, tire le hasard et paie ; le dessin et l'animation
//  sont dans lib/caverne/caverne.js, branché sur le décor (components/caverne/SalleDesJeux.jsx) une fois la
//  bourse du joueur lue.
//  On y entre depuis la barre latérale. Elle est scellée : sans badge activé (lib/caverne/badges.js),
//  on arrive devant le portail (components/caverne/Portail.jsx) : on y pose un badge, il s'allume, on le
//  franchit, et la salle des jeux s'ouvre. Avec un badge déjà actif, on entre directement ; on peut revenir au
//  portail (encore ouvert) depuis le hall.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Page from '../components/Page.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { monterCaverne } from '../lib/caverne/caverne.js';
import { lireBadges, accesOuvert, tempsRestant } from '../lib/caverne/badges.js';
import Portail from '../components/caverne/Portail.jsx';
import SalleDesJeux from '../components/caverne/SalleDesJeux.jsx';

// Une fonction du serveur : sa réponse, ou une erreur avec le message à montrer
async function rpc(nom, args) {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data;
}
const SERVEUR = {
  commencer: (jeu, monnaie, mise, option = null) => rpc('caverne_commencer', { p_jeu: jeu, p_monnaie: monnaie, p_mise: mise, p_option: option }),
  voir: () => rpc('caverne_dragon_voir'),
  ouvrir: (i) => rpc('caverne_bourse_ouvrir', { p_case: i }),
  avancer: (n) => rpc('caverne_pont_avancer', { p_pas: n }),
  tirer: () => rpc('caverne_lac_tirer'),
  encaisser: () => rpc('caverne_encaisser'),
};

export default function Caverne() {
  const { joueur } = useAuth();
  const discordId = joueur?.discord_id ?? null;
  const notifier = useNotifier();
  const racine = useRef(null);
  const [bourse, setBourse] = useState(null);
  const [badges, setBadges] = useState(null);   // caverne_badges_etat, ou { erreur }
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [entre, setEntre] = useState(false);     // le portail est franchi (ou le badge était déjà actif)

  // La bourse du joueur, lue à l'arrivée (et relue en revenant du portail) ; ensuite, chaque réponse du serveur la donne
  const lireBourse = (actif = () => true) => supabase.from('wallets').select('balance, cristaux').eq('discord_id', discordId).maybeSingle()
    .then(({ data }) => { if (actif()) setBourse({ or: data?.balance ?? 0, cristaux: data?.cristaux ?? 0 }); });
  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    lireBourse(() => actif);
    lireBadges().then((e) => { if (!actif) return; setBadges(e); if (accesOuvert(e)) setEntre(true); }).catch((e) => { if (actif) setBadges({ erreur: e.message }); });
    return () => { actif = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordId]);
  // Le temps qui reste (chaque minute)
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // La Caverne est scellée tant qu'aucun badge n'est activé (le serveur le revérifie à chaque partie) ;
  // on y entre en franchissant le portail
  const ouverte = accesOuvert(badges);
  const pret = bourse !== null && ouverte && entre;
  useEffect(() => {
    if (!pret || !racine.current) return undefined;
    return monterCaverne(racine.current, { serveur: SERVEUR, notifier, bourse });
    // une seule fois, quand la bourse est connue : le jeu tient ensuite son propre état
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);

  return (
    <Page id="caverne" classes="page-caverne" titre="La Caverne aux Trésors">
      <div className="caverne" ref={racine}>
        <canvas id="bg" />
        {badges && !(ouverte && entre) && <Portail badges={badges} surEtat={setBadges} surEntree={() => { setBourse(null); lireBourse(); setEntre(true); }} />}
        {pret && <SalleDesJeux temps={tempsRestant(badges.jusqu_a, maintenant)} surPortail={() => setEntre(false)} />}
      </div>
    </Page>
  );
}
