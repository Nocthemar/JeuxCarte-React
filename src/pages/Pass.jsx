// =====================================================================
//  Écran « Pass de saison » (ancien pass.html + JS/pass.js, même HTML)
//  - la saison en cours, ses paliers × 2 pistes (gratuite en haut, premium en bas), et la progression du joueur ;
//  - réclamer une récompense : pass_reclamer ; débloquer la piste premium (en or) : pass_debloquer_premium,
//    avec une confirmation en deux clics, puis la fête (rayons, blason, pluie de pièces, fanfare) et la ligne
//    premium qui s'illumine case par case.
//  Tout est vérifié côté serveur : palier atteint, déjà réclamé, solde.
//  L'XP se gagne dans le jeu (fin de duel, mode Histoire). Les boosters gagnés s'ouvrent dans la Boutique.
// =====================================================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Page from '../components/Page.jsx';
import ApercuCarte from '../components/ApercuCarte.jsx';
import Recompense from '../components/pass/Recompense.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { animationsReduites } from '../lib/preferences.js';
import { urlPublique } from '../lib/chemins.js';
import { jouerSon } from '../lib/son.js';
import { RARETES } from '../data/affichage.js';
import { TYPES, nombre, PIECE } from '../data/pass.js';
import { badgeDuPass } from '../lib/caverne/badges.js';

// La saison en cours, ses paliers, et ce qu'il faut pour afficher les récompenses (cartes, boosters, plateaux)
// (la saison et ses paliers arrivent en une seule requête ; ce qu'il faut pour les récompenses vient
// ensuite, en même temps que la progression du joueur : la page n'attend que deux allers-retours)
async function chargerSaison() {
  const maintenant = new Date().toISOString();
  const { data } = await supabase.from('saisons').select('*, pass_paliers(numero, piste, type_recompense, valeur)')
    .eq('active', true).lte('date_debut', maintenant).gte('date_fin', maintenant).maybeSingle();
  if (!data) return { saison: null };
  const { pass_paliers: lignes, ...saison } = data;
  const paliers = lignes ?? [];
  return { saison, liste: paliers, paliers: new Map(paliers.map((p) => [`${p.numero}-${p.piste}`, p])), catalogue: null };
}

async function chargerCatalogue(paliers) {
  const catalogue = { cartes: new Map(), boosters: new Map(), plateaux: new Map() };
  const noms = [...new Set(paliers.filter((p) => p.type_recompense === 'carte').map((p) => p.valeur?.nom))].filter(Boolean);
  await Promise.all([
    noms.length && supabase.from('cards').select('*').in('name', noms)
      .then(({ data }) => { catalogue.cartes = new Map((data ?? []).map((c) => [c.name, c])); }),
    paliers.some((p) => p.type_recompense === 'booster') && supabase.from('boosters').select('id, nom, image')
      .then(({ data }) => { catalogue.boosters = new Map((data ?? []).map((b) => [b.id, b])); }),
    paliers.some((p) => p.type_recompense === 'fond_plateau' && p.valeur?.plateau) && supabase.from('plateaux').select('id, nom, miniature')
      .then(({ data }) => { catalogue.plateaux = new Map((data ?? []).map((x) => [x.id, x])); }),
  ]);
  return catalogue;
}

async function chargerJoueur(discordId, saisonId) {
  const [{ data: prog }, { data: bourse }] = await Promise.all([
    supabase.from('pass_progression').select('xp, premium, reclames_gratuite, reclames_premium')
      .eq('discord_id', discordId).eq('saison_id', saisonId).maybeSingle(),
    supabase.from('wallets').select('balance').eq('discord_id', discordId).maybeSingle(),
  ]);
  return { prog: prog ?? { xp: 0, premium: false, reclames_gratuite: [], reclames_premium: [] }, solde: bourse?.balance ?? 0 };
}

// Compte à rebours jusqu'à la fin de la saison
function Rebours({ fin }) {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const reste = Math.max(0, new Date(fin).getTime() - maintenant);
  if (reste === 0) return <p className="pass-rebours" id="rebours" aria-live="off">La saison est terminée.</p>;
  const s = Math.floor(reste / 1000);
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (
    <p className="pass-rebours" id="rebours" aria-live="off">
      Fin de la saison dans <strong>{j} j {String(h).padStart(2, '0')} h {String(m).padStart(2, '0')} min {String(s % 60).padStart(2, '0')} s</strong>
    </p>
  );
}

// Pièces et étincelles qui jaillissent du centre de l'écran et retombent en tournant (écran de fête)
function pluie(zone, n) {
  const l = innerWidth; const h = innerHeight;
  for (let i = 0; i < n; i++) {
    const piece = i % 3 === 0;
    const el = document.createElement(piece ? 'img' : 'span');
    if (piece) { el.src = urlPublique(PIECE); el.alt = ''; }
    el.className = piece ? 'fete__piece' : 'fete__etincelle';
    zone.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const force = (0.25 + Math.random() * 0.45) * Math.min(l, h);
    const dx = Math.cos(angle) * force;
    const dy = Math.sin(angle) * force * 0.7 - h * 0.12;
    const a = el.animate([
      { transform: 'translate(-50%, -50%) scale(.2) rotate(0deg)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + h * 0.45}px)) scale(.7) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, delay: Math.random() * 350, easing: 'cubic-bezier(.15,.7,.35,1)', fill: 'both' });
    a.onfinish = () => el.remove();
  }
}

// L'écran de fête : piste premium débloquée (se ferme au clic, à Échap, ou tout seul après 6 s)
function Fete({ saison, dispo, surFermeture }) {
  const [sortie, setSortie] = useState(false);
  const particules = useRef(null);
  const bouton = useRef(null);
  const fermer = useRef(null);
  // (la dernière version, gardée dans une ref : le minuteur posé au début l'appelle 6 s plus tard)
  useEffect(() => {
    fermer.current = () => {
      if (sortie) return;
      setSortie(true);
      setTimeout(surFermeture, animationsReduites() ? 0 : 380);
    };
  });
  useEffect(() => {
    document.body.classList.add('fete-ouverte');
    jouerSon('fanfare');
    let seconde = null;
    if (!animationsReduites()) {
      pluie(particules.current, 46);
      seconde = setTimeout(() => pluie(particules.current, 24), 650);
    }
    bouton.current.focus();
    const minuteur = setTimeout(() => fermer.current(), 6000);
    return () => { clearTimeout(minuteur); clearTimeout(seconde); document.body.classList.remove('fete-ouverte'); };
  }, []);
  return (
    <div className={`fete${sortie ? ' fete--sortie' : ''}`} id="fete" role="dialog" aria-modal="true" aria-labelledby="fete-titre"
      onClick={(e) => { if (e.target === e.currentTarget) fermer.current(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') fermer.current(); }}>
      <div className="fete__rayons" aria-hidden="true" />
      <div className="fete__particules" id="fete-particules" aria-hidden="true" ref={particules} />
      <div className="fete__contenu">
        <div className="fete__blason" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 8l4 3 5-6 5 6 4-3-2 11H5z" /></svg>
        </div>
        <span className="fete__sur" id="fete-saison">{saison.nom}</span>
        <h2 className="fete__titre" id="fete-titre">Piste premium débloquée</h2>
        <p className="fete__texte" id="fete-texte">
          {dispo ? `${dispo} récompense${dispo > 1 ? 's' : ''} premium t'attend${dispo > 1 ? 'ent' : ''} déjà !`
            : 'Chaque palier atteint te donnera aussi sa récompense premium.'}
        </p>
        <button type="button" className="btn-premium fete__bouton" id="fete-ok" ref={bouton} onClick={() => fermer.current()}>Voir mes récompenses</button>
      </div>
    </div>
  );
}

const PrixPremium = ({ prix }) => <span className="btn-premium__prix"><img src={urlPublique(PIECE)} alt="" /> {nombre(prix)}</span>;

export default function Pass() {
  const { joueur, chargement } = useAuth();
  const notifier = useNotifier();
  const discordId = joueur?.discord_id ?? null;
  const [d, setD] = useState(null);                  // la saison (null : en chargement)
  const [compte, setCompte] = useState({ pour: null });
  const [version, setVersion] = useState(0);         // change après une réclamation : la progression se recharge
  const [ouverte, setOuverte] = useState(null);      // la carte affichée en grand
  const [confirmation, setConfirmation] = useState(false);   // premier clic sur « Débloquer » fait
  const [achat, setAchat] = useState(false);
  const [fete, setFete] = useState(null);            // { dispo } pendant l'écran de fête
  const piste = useRef(null);
  const ouvertureFaite = useRef(false);

  useEffect(() => {
    chargerSaison().then(async (base) => {
      setD(base);
      if (base.saison) setD({ ...base, catalogue: await chargerCatalogue(base.liste) });
    }).catch((e) => {
      console.error(e);
      setD({ saison: null, erreur: true });
      notifier('Le pass n\'a pas pu être chargé. Réessaie dans un instant.', 'erreur');
    });
  }, [notifier]);
  const saison = d?.saison ?? null;
  useEffect(() => {
    if (!discordId || !saison) return undefined;
    let actif = true;
    chargerJoueur(discordId, saison.id).then((c) => { if (actif) setCompte({ pour: discordId, ...c }); });
    return () => { actif = false; };
  }, [discordId, saison, version]);
  const c = discordId && compte.pour === discordId ? compte : null;
  const pret = !!saison && !!d.catalogue && !chargement && (!discordId || !!c);

  // Le premier clic sur « Débloquer » devient « Confirmer » pendant 4 s
  useEffect(() => {
    if (!confirmation) return undefined;
    const t = setTimeout(() => setConfirmation(false), 4000);
    return () => clearTimeout(t);
  }, [confirmation]);

  const xp = c?.prog.xp ?? 0;
  const palierActuel = saison ? Math.min(saison.nb_paliers, Math.floor(xp / saison.xp_par_palier)) : 0;

  // La piste s'ouvre sur le palier en cours
  useLayoutEffect(() => {
    if (!pret || ouvertureFaite.current || !piste.current) return;
    ouvertureFaite.current = true;
    const cible = piste.current.querySelector(`[data-palier="${Math.max(1, palierActuel)}"]`);
    if (cible) piste.current.scrollLeft = Math.max(0, cible.offsetLeft - piste.current.clientWidth / 2 + cible.clientWidth / 2);
  }, [pret, palierActuel]);

  const etatRecompense = (numero, nomPiste) => {
    if (!c) return 'verrouillee';
    const reclames = nomPiste === 'premium' ? c.prog.reclames_premium : c.prog.reclames_gratuite;
    if ((reclames ?? []).includes(numero)) return 'reclamee';
    const atteint = xp >= numero * saison.xp_par_palier;
    if (!atteint || (nomPiste === 'premium' && !c.prog.premium)) return 'verrouillee';
    return 'disponible';
  };

  const reclamer = async (numero, nomPiste) => {
    const { data, error } = await supabase.rpc('pass_reclamer', { p_numero: numero, p_piste: nomPiste });
    if (error) notifier(error.message || 'Impossible de réclamer cette récompense.', 'erreur');
    else if (data.type === 'or') notifier(`+${nombre(data.or)} or ajoutés à ta bourse.`);
    else if (data.type === 'booster') notifier(`${data.quantite > 1 ? `${data.quantite} × ` : ''}« ${data.nom} » ajouté : ouvre-le dans la Boutique !`);
    else if (data.type === 'carte') {
      notifier(data.deja_possedee ? `Tu avais déjà « ${data.nom} » : +${nombre(data.or)} or à la place.` : `« ${data.nom} » rejoint ta collection !`);
    } else if (data.type === 'carte_rarete') {
      const rarete = (RARETES[data.rarete] ?? 'rare').toLowerCase();
      notifier(!data.deja_possedee
        ? `Carte ${rarete} : « ${data.nom} » rejoint ta collection !`
        : data.or > 0
          ? `Plus aucune carte ${rarete} à découvrir : +${nombre(data.or)} or à la place.`
          : `Tu as déjà toutes les cartes ${rarete}s : un exemplaire de plus de « ${data.nom} » (à recycler dans ton grimoire).`);
    } else if (data.type === 'badge_caverne') {
      notifier(`Badge de la Caverne « ${badgeDuPass(data.nom)?.nom ?? data.nom} » obtenu : active-le quand tu veux, à la Boutique ou devant la Caverne.`);
    } else notifier(`${TYPES[data.type]} « ${data.nom} » obtenu.`);
    setVersion((v) => v + 1);
  };

  // Débloquer la piste premium : le premier clic demande confirmation (pas de fenêtre du navigateur),
  // le second achète. Évite de dépenser l'or par un clic de travers.
  const debloquer = async () => {
    if (!confirmation) { setConfirmation(true); return; }
    setConfirmation(false);
    setAchat(true);
    const { error } = await supabase.rpc('pass_debloquer_premium');
    setAchat(false);
    if (error) { notifier(error.message || 'Impossible de débloquer la piste premium.', 'erreur'); setVersion((v) => v + 1); return; }
    const nouveau = await chargerJoueur(discordId, saison.id);
    setCompte({ pour: discordId, ...nouveau });
    // Les récompenses premium déjà atteintes
    let dispo = 0;
    for (let i = 1; i <= saison.nb_paliers; i++) {
      if (d.paliers.has(`${i}-premium`) && nouveau.prog.xp >= i * saison.xp_par_palier && !(nouveau.prog.reclames_premium ?? []).includes(i)) dispo += 1;
    }
    setFete({ dispo });
  };

  // Après la fête : la ligne premium s'éclaire de gauche à droite ; la piste défile jusqu'à la première à réclamer
  const revelerPistePremium = () => {
    setFete(null);
    const premiere = piste.current?.querySelector('.recompense--premium.recompense--disponible');
    if (premiere) piste.current.scrollTo({ left: Math.max(0, premiere.closest('.palier').offsetLeft - 40), behavior: animationsReduites() ? 'auto' : 'smooth' });
    if (animationsReduites()) return;
    piste.current?.querySelectorAll('.recompense--premium').forEach((el, i) => {
      el.animate([
        { transform: 'translateY(10px) scale(.92)', filter: 'brightness(.5) saturate(.5)' },
        { transform: 'translateY(-6px) scale(1.05)', filter: 'brightness(1.9) saturate(1.4)', offset: 0.45 },
        { transform: 'none', filter: 'none' },
      ], { duration: 650, delay: 250 + i * 55, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
    });
  };

  const titre = saison ? `${saison.nom} — Pass de saison` : 'Pass de saison';
  const dansPalier = saison ? (palierActuel >= saison.nb_paliers ? saison.xp_par_palier : xp % saison.xp_par_palier) : 0;
  const manque = saison && c ? saison.prix_premium - c.solde : 0;

  return (
    <Page id="pass" classes="page-profil page-pass" titre={titre}>
      <main className="profil-wrap pass-wrap">
        {/* En-tête : nom de la saison et compte à rebours */}
        <header className="pass-entete">
          <span className="pass-entete__sur">Pass de saison</span>
          <h1 id="saison-nom">{!d ? 'Chargement…' : saison ? saison.nom : 'Pass de saison'}</h1>
          {saison ? <Rebours fin={saison.date_fin} /> : <p className="pass-rebours" id="rebours" aria-live="off" />}
        </header>

        {/* Pas connecté */}
        <section className="pass-connexion" id="bloc-connexion" hidden={chargement || !!joueur}>
          <p>Connecte-toi avec Discord pour gagner de l&apos;XP de pass, réclamer tes récompenses et débloquer la piste premium.</p>
          <button type="button" className="btn-discord" id="btn-connexion" onClick={() => connexionDiscord()}>
            <span className="btn-discord__logo" aria-hidden="true" />
            <span className="btn-discord__texte">Connecter Discord</span>
          </button>
        </section>

        {/* Aucune saison en cours */}
        <section className="pass-vide" id="bloc-vide" hidden={!d || !!saison}>
          <p>Aucune saison n&apos;est en cours pour le moment. Reviens bientôt !</p>
        </section>

        {pret && (
          <div id="bloc-saison">
            {/* Palier actuel, barre d'XP, piste premium */}
            <section className="pass-tableau">
              <div className="pass-niveau">
                <div className="pass-niveau__blason" aria-hidden="true"><span id="palier-actuel">{palierActuel}</span></div>
                <div className="pass-niveau__infos">
                  <span className="pass-niveau__libelle">Palier <strong id="palier-texte">{palierActuel}</strong> / <span id="palier-max">{saison.nb_paliers}</span></span>
                  <div className="pass-barre" role="progressbar" id="barre-xp" aria-valuemin="0" aria-valuemax={saison.xp_par_palier} aria-valuenow={dansPalier} aria-label="XP vers le palier suivant">
                    <span className="pass-barre__remplie" id="barre-remplie" style={{ width: `${(dansPalier / saison.xp_par_palier) * 100}%` }} />
                  </div>
                  <span className="pass-niveau__xp" id="xp-texte">
                    {palierActuel >= saison.nb_paliers
                      ? `Pass terminé : ${nombre(xp)} XP`
                      : `${nombre(dansPalier)} / ${nombre(saison.xp_par_palier)} XP vers le palier ${palierActuel + 1}`}
                  </span>
                </div>
                {/* Comment gagner de l'XP : une bulle qui s'ouvre par-dessus la page */}
                <details className="pass-aide">
                  <summary>Gagner de l&apos;XP ?</summary>
                  <ul>
                    <li><strong>Duel contre l&apos;IA</strong> : 100 XP par victoire et de l&apos;or selon la difficulté (2 en facile, 5 en normal, 10 en difficile), 30 XP par défaite (1 000 XP par jour au plus).</li>
                    <li><strong>Duel contre un ami</strong> : 150 XP par victoire, 50 par défaite (1 500 XP par jour au plus).</li>
                    <li><strong>Mode Histoire</strong> : 200 XP par niveau gagné pour la première fois, 500 pour un boss.</li>
                    <li>Un abandon ne rapporte rien.</li>
                  </ul>
                </details>
              </div>
              {c && (
                <div className={`pass-premium${c.prog.premium ? ' est-debloque' : ''}`} id="bloc-premium">
                  <span className="pass-premium__titre">Piste premium</span>
                  {c.prog.premium && <p className="pass-premium__texte" id="premium-texte">Débloquée : toutes les récompenses premium atteintes sont à toi.</p>}
                  {!c.prog.premium && (
                    <button type="button" className={`btn-premium${confirmation ? ' btn-premium--confirmer' : ''}`} id="btn-premium"
                      title="Une carte transcendante, des cartes légendaires, des Grands Boosters et l'Arène des Cristaux d'Or. Payée avec l'or du jeu."
                      disabled={manque > 0 || achat} onClick={debloquer}>
                      {confirmation ? 'Confirmer l\'achat' : 'Débloquer la piste premium'} <PrixPremium prix={saison.prix_premium} />
                    </button>
                  )}
                  <span className="pass-premium__solde" id="premium-solde">
                    {c.prog.premium ? '' : manque > 0 ? `Ta bourse : ${nombre(c.solde)} or — il en manque ${nombre(manque)}.` : `Ta bourse : ${nombre(c.solde)} or.`}
                  </span>
                </div>
              )}
            </section>

            {/* La piste : gratuite en haut, premium en bas (défile horizontalement) */}
            <section className="pass-piste" aria-label="Récompenses du pass">
              <div className="pass-piste__legende" aria-hidden="true">
                <span className="legende legende--gratuite">Gratuit</span>
                <span className="legende legende--premium">Premium</span>
              </div>
              <div className="pass-piste__defile" id="piste" tabIndex={0} ref={piste}
                onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
                {Array.from({ length: saison.nb_paliers }, (_, k) => {
                  const i = k + 1;
                  const atteint = c ? palierActuel : 0;
                  return (
                    <div key={i} className={`palier${i <= atteint ? ' palier--atteint' : ''}${i === atteint + 1 ? ' palier--suivant' : ''}`} data-palier={i}>
                      <span className="palier__numero">{i}</span>
                      {['gratuite', 'premium'].map((nomPiste) => (
                        <Recompense key={nomPiste} p={d.paliers.get(`${i}-${nomPiste}`)} piste={nomPiste} etat={etatRecompense(i, nomPiste)}
                          premiumBloque={!!c && !c.prog.premium} catalogue={d.catalogue} surApercu={setOuverte} surReclamer={reclamer} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      {fete && <Fete saison={saison} dispo={fete.dispo} surFermeture={revelerPistePremium} />}
      {ouverte && <ApercuCarte carte={ouverte} surFermeture={() => setOuverte(null)} />}
    </Page>
  );
}
