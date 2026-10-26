// =====================================================================
//  Écran « Succès » (ancien succes.html + JS/succes.js, même HTML)
//  - la progression est calculée par le serveur (mes_succes) ; chaque succès a une rareté (commun, rare,
//    épique, légendaire) et le pourcentage de joueurs qui l'ont obtenu, comme sur Steam ;
//  - « Réclamer » donne l'or (reclamer_succes, qui revérifie l'objectif) et joue l'animation de la rareté ;
//    « Tout réclamer » les enchaîne ;
//  - la vitrine : jusqu'à 3 succès obtenus épinglés comme badges sur le profil (choisir_vitrine_succes).
// =====================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Page from '../components/Page.jsx';
import Badge from '../components/Badge.jsx';
import { supabase } from '../lib/supabase.js';
import { useAuth, connexionDiscord } from '../lib/auth.js';
import { useNotifier } from '../lib/notification.js';
import { urlPublique } from '../lib/chemins.js';
import { RARETES_SUCCES, pourcentageTexte, celebrerSucces } from '../lib/succes.js';

const ORDRE_CATEGORIES = ['Duels', 'Classé', 'Collection', 'Boosters', 'Histoire', 'Marché'];
const VITRINE_MAX = 3;
const nombre = (n) => Number(n).toLocaleString('fr-FR');
const pret = (s) => s.atteint && !s.reclame;
const Or = () => <img src={urlPublique('img/Equipement/Or-icone.webp')} alt="" />;

// Un succès de la liste
function Succes({ s, vitrinePleine, surReclamer, surEpingler }) {
  const [envoi, setEnvoi] = useState(false);
  const agir = async (fn) => { setEnvoi(true); await fn(); setEnvoi(false); };
  const pct = s.objectif ? Math.round((s.progression / s.objectif) * 100) : 0;
  const etat = s.reclame ? 'est-reclame' : s.atteint ? 'est-pret' : 'est-verrouille';
  const epingle = !!s.vitrine;
  const plein = !epingle && vitrinePleine;
  return (
    <article className={`succ succ--${s.rarete} ${etat}`}>
      <Badge s={s} />
      <div className="succ__corps">
        <h3 className="succ__nom">{s.nom}</h3>
        <p className="succ__desc">{s.description}</p>
        <p className="succ__meta">
          <span className={`rarete-succes rarete-succes--${s.rarete}`}>{RARETES_SUCCES[s.rarete]?.nom ?? 'Commun'}</span>
          <span className="succ__pct">{pourcentageTexte(s.pourcentage)} des joueurs</span>
        </p>
        {!s.reclame && <div className="succ__jauge" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>}
      </div>
      <div className="succ__droite">
        {s.recompense > 0 && <span className="succ__or"><Or /> {nombre(s.recompense)}</span>}
        {s.reclame ? (
          <button type="button" className={`succ__epingle${epingle ? ' est-epingle' : ''}`} data-epingler={s.id} aria-pressed={epingle}
            disabled={plein || envoi} title={plein ? 'Ta vitrine est pleine : retire un badge d\'abord' : undefined} onClick={() => agir(surEpingler)}>
            {epingle ? '★ Sur mon profil' : '☆ Épingler'}
          </button>
        ) : s.atteint ? (
          <button type="button" className="succ__btn" data-reclamer={s.id} disabled={envoi} onClick={() => agir(surReclamer)}>Réclamer</button>
        ) : (
          <span className="succ__compte">{nombre(s.progression)} / {nombre(s.objectif)}</span>
        )}
      </div>
    </article>
  );
}

export default function PageSucces() {
  const { joueur, chargement } = useAuth();
  const notifier = useNotifier();
  const discordId = joueur?.discord_id ?? null;
  const [donnees, setDonnees] = useState({ pour: null });   // { pour, succes } ou { pour, erreur }
  const [toutEnCours, setToutEnCours] = useState(false);

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    supabase.rpc('mes_succes').then(({ data, error }) => {
      if (actif) setDonnees(error ? { pour: discordId, erreur: true } : { pour: discordId, succes: data ?? [] });
    });
    return () => { actif = false; };
  }, [discordId]);
  const d = discordId && donnees.pour === discordId ? donnees : null;
  const succes = d?.succes ?? [];
  const majSucces = (fn) => setDonnees((x) => ({ ...x, succes: fn(x.succes) }));
  const vitrine = succes.filter((s) => s.vitrine).sort((a, b) => a.vitrine - b.vitrine);

  // Réclame un succès, puis joue son animation. Renvoie l'or gagné.
  const reclamer = async (id) => {
    const { data, error } = await supabase.rpc('reclamer_succes', { p_succes_id: id });
    if (error) { notifier(error.message || 'Impossible de réclamer ce succès.', 'erreur'); return 0; }
    const s = succes.find((x) => x.id === id);
    majSucces((liste) => liste.map((x) => (x.id === id
      ? { ...x, reclame: true, reclame_le: new Date().toISOString(), pourcentage: data?.pourcentage ?? x.pourcentage } : x)));
    await celebrerSucces({ ...s, ...data });
    return data?.recompense ?? 0;
  };
  const toutReclamer = async () => {
    setToutEnCours(true);
    let total = 0;
    for (const s of succes.filter(pret)) total += await reclamer(s.id);
    setToutEnCours(false);
    if (total) notifier(`Succès réclamés : +${nombre(total)} or !`);
  };

  // Épingle ou retire un badge de la vitrine du profil
  const basculerVitrine = async (id) => {
    const ids = vitrine.map((s) => s.id);
    const nouveaux = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (nouveaux.length > VITRINE_MAX) { notifier('Trois badges au plus : retire-en un d\'abord.', 'erreur'); return; }
    const { error } = await supabase.rpc('choisir_vitrine_succes', { p_ids: nouveaux });
    if (error) { notifier(error.message || 'Impossible de modifier ta vitrine.', 'erreur'); return; }
    majSucces((liste) => liste.map((s) => ({ ...s, vitrine: nouveaux.includes(s.id) ? nouveaux.indexOf(s.id) + 1 : null })));
    notifier(nouveaux.includes(id) ? 'Badge épinglé sur ton profil.' : 'Badge retiré de ton profil.');
  };

  const categories = [...new Set(succes.map((s) => s.categorie))]
    .sort((a, b) => (ORDRE_CATEGORIES.indexOf(a) + 1 || 99) - (ORDRE_CATEGORIES.indexOf(b) + 1 || 99));
  const atteints = succes.filter((s) => s.atteint).length;
  const prets = succes.filter(pret);
  const orPret = prets.reduce((t, s) => t + s.recompense, 0);
  const affiche = !!d?.succes;

  return (
    <Page id="succes" classes="page-profil page-succes" titre="Succès" braises>
      <main className="succes-page">
        {/* En-tête : titre et progression (succès débloqués / total, or à réclamer) */}
        <header className="succes-page__tete">
          <span className="succes-page__sur">Les hauts faits du Duel des Couronnes</span>
          <h1 className="succes-page__titre">Succès</h1>
          <p className="succes-page__intro">Chaque exploit accompli dans le jeu est gravé ici. Réclame l&apos;or de ceux que tu as débloqués.</p>
          {affiche && (
            <div className="succes-page__progression" id="progression">
              <div className="succes-page__compte"><strong id="nb-atteints">{atteints}</strong> / <span id="nb-total">{succes.length}</span> <small>succès débloqués</small></div>
              <div className="succes-page__jauge" aria-hidden="true"><span id="jauge" style={{ width: `${succes.length ? (atteints / succes.length) * 100 : 0}%` }} /></div>
              <button type="button" className="succes-page__tout" id="btn-tout" hidden={prets.length < 2} disabled={toutEnCours} onClick={toutReclamer}>
                Tout réclamer ({prets.length} succès · {nombre(orPret)} or)
              </button>
            </div>
          )}
        </header>

        {/* Pas connecté */}
        {!chargement && !joueur && (
          <section className="succes-page__connexion" id="non-connecte">
            <p>Connecte-toi avec Discord pour voir tes succès et réclamer leurs récompenses.</p>
            <button id="btn-connexion" type="button" className="btn-discord" onClick={() => connexionDiscord()}>
              <span className="btn-discord__logo" aria-hidden="true" />
              Connecter Discord
            </button>
          </section>
        )}

        {/* Vitrine : les 3 badges épinglés sur le profil */}
        {affiche && (
          <section className="vitrine-succes" id="vitrine">
            <span className="vitrine-succes__titre">Badges de ton profil</span>
            <div className="vitrine-succes__places">
              {Array.from({ length: VITRINE_MAX }, (_, i) => {
                const s = vitrine[i];
                return s ? (
                  <button key={s.id} type="button" className="vitrine-succes__place est-pleine" data-epingler={s.id} title={`${s.nom} : retirer de mon profil`}
                    onClick={() => basculerVitrine(s.id)}>
                    <Badge s={s} taille="grand" /><span className="vitrine-succes__nom">{s.nom}</span>
                  </button>
                ) : (
                  <span key={`libre${i}`} className="vitrine-succes__place"><span className="vitrine-succes__vide">+</span><span className="vitrine-succes__nom">Emplacement libre</span></span>
                );
              })}
            </div>
            <p className="vitrine-succes__aide">Épingle jusqu&apos;à {VITRINE_MAX} succès obtenus : ils s&apos;affichent sur ton <Link to="/profil">profil</Link>.</p>
          </section>
        )}

        {/* Les succès, par catégorie */}
        <div id="liste" className="succes-page__liste">
          {joueur && !d && <p className="vide">Les hauts faits se dévoilent…</p>}
          {d?.erreur && <p className="vide">Les succès ne sont pas encore disponibles.</p>}
          {affiche && (categories.length ? categories.map((c) => {
            const liste = succes.filter((s) => s.categorie === c);
            return (
              <section key={c} className="succes-cat">
                <h2 className="succes-cat__titre">{c} <small>{liste.filter((s) => s.atteint).length} / {liste.length}</small></h2>
                <div className="succes-cat__liste">
                  {liste.map((s) => (
                    <Succes key={s.id} s={s} vitrinePleine={vitrine.length >= VITRINE_MAX}
                      surReclamer={() => reclamer(s.id)} surEpingler={() => basculerVitrine(s.id)} />
                  ))}
                </div>
              </section>
            );
          }) : <p className="vide">Aucun succès pour le moment.</p>)}
        </div>
      </main>
    </Page>
  );
}
