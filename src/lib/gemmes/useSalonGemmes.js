// =====================================================================
//  Les Gemmes du Codex contre un ami : le salon (le même que celui du Duel, lib/salon.js), sans arbitre.
//  Les règles sont « à graine » (moteur/gemmes.js) : l'hôte tire la graine et l'ordre de jeu, l'envoie avec
//  les cartes des deux joueurs (« debut »), puis chacun ne s'envoie que SES actions, numérotées (« action »).
//  Chaque côté rejoue les mêmes actions sur la même partie : les deux écrans restent identiques, et une
//  action interdite (pas son tour, échange qui n'aligne rien…) est refusée des deux côtés par les règles.
//  Un message perdu se redemande (« renvoi ») : l'autre renvoie ce qui manque.
//
//  useSalonGemmes({ joueur, cartes }) ->
//    vue      : { code, role, dedans, pret, texte, erreur, absent }
//    partie   : { p, graine, combattants, moi, fini } ou null ; version : change à chaque action reçue
//    journal  : ref des actions de la partie [{ qui, action }] (les deux joueurs), à lire depuis la Table
//    entrer(code, role), quitter(), basculerPret(), jouer(action), abandonner(), revanche()
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { ouvrirSalon, codeValide } from '../salon.js';
import { nouvelleGraine } from '../../moteur/hasard.js';
import { estHote, retenirHote, DELAI_RETOUR } from '../ligne.js';

const VIDE = { code: null, role: null, dedans: [], pret: false, texte: '', erreur: '', absent: false };
export const lienGemmes = (code) => `${location.origin}${location.pathname}#/gemmes?salon=${code}`;

function texteSalon(role, cle, dedans, pret) {
  const autre = dedans.find((x) => x.cle !== cle) ?? null;
  if (!dedans.some((x) => x.cle === cle)) return 'Connexion au salon…';
  if (autre && autre.jeu !== 'gemmes') return 'Ce salon est celui d’un Duel des Couronnes : crée un nouveau salon de Gemmes.';
  if (autre && autre.role === role) return 'Ce salon a deux hôtes (onglet dupliqué ?) : crée un nouveau salon.';
  if (!autre) return role === 'hote'
    ? 'En attente de ton adversaire… Copie le lien du salon et envoie-le-lui.'
    : 'L’hôte n’est pas (ou plus) dans ce salon. Attends-le, ou crée ton propre salon.';
  if (!pret) return 'Vérifie tes trois cartes, puis déclare-toi prêt.';
  if (!autre.pret) return `En attente de ${autre.nom}…`;
  return 'La partie commence !';
}

export function useSalonGemmes({ joueur, cartes }) {
  const [vue, setVue] = useState(VIDE);
  const [partie, setPartie] = useState(null);
  const [version, setVersion] = useState(0);
  const salon = useRef(null);
  const journal = useRef([]);
  const partieRef = useRef(null);
  const dernierRecu = useRef(0);
  const absentDepuis = useRef(null);
  const cartesRef = useRef(cartes);
  useEffect(() => { cartesRef.current = cartes; }, [cartes]);

  const commencer = useCallback((p) => {
    partieRef.current = p;
    journal.current = [];
    dernierRecu.current = Date.now();
    setPartie(p);
    setVersion((v) => v + 1);
  }, []);

  // L'hôte lance une partie (la première, ou la revanche) avec les cartes annoncées par les deux joueurs
  const lancer = useCallback((s, dedans, p) => {
    const moi = dedans.find((x) => x.cle === s.cle);
    const autre = dedans.find((x) => x.cle !== s.cle);
    const roles = Math.random() < 0.5 ? ['hote', 'invite'] : ['invite', 'hote'];
    const fiche = (x) => ({ nom: x.nom, avatar: x.avatar ?? null, cartes: (x.cartes ?? []).slice(0, 3) });
    const message = {
      t: 'debut', p, graine: nouvelleGraine(), roles,
      combattants: roles.map((r) => fiche(r === 'hote' ? moi : autre)),
    };
    s.envoyer('jeu', message);
    s.debut = message;
    commencer({ ...message, moi: roles.indexOf('hote') });
  }, [commencer]);

  const quitter = useCallback(() => {
    const s = salon.current;
    if (!s) return;
    salon.current = null;
    if (s.role === 'hote') retenirHote(s.code, false);
    s.fermer();
    partieRef.current = null;
    setPartie(null);
    setVue(VIDE);
  }, []);

  const entrer = useCallback((code, role) => {
    if (!joueur || !codeValide(code)) return;
    if (salon.current) quitter();
    if (role === 'hote') retenirHote(code, true);
    let s = null;
    const surPresence = (dedans) => {
      if (salon.current !== s) return;
      const autre = dedans.find((x) => x.cle !== s.cle) ?? null;
      // L'adversaire part en pleine partie : il a DELAI_RETOUR pour revenir, sinon la victoire est donnée
      if (partieRef.current && !partieRef.current.fini) {
        if (!autre) absentDepuis.current ??= Date.now();
        else absentDepuis.current = null;
      }
      setVue((v) => ({ ...v, dedans, absent: !!partieRef.current && !autre, texte: texteSalon(s.role, s.cle, dedans, s.presence.pret) }));
      if (s.role !== 'hote' || !autre || autre.jeu !== 'gemmes' || autre.role === 'hote') return;
      const p = partieRef.current;
      if (!p && s.presence.pret && autre.pret) lancer(s, dedans, 1);
      // La revanche : les deux l'ont demandée pour la partie qui vient de finir
      else if (p?.fini && s.presence.revanche === p.p && autre.revanche === p.p) lancer(s, dedans, p.p + 1);
    };
    const surMessage = (evenement, m) => {
      if (salon.current !== s || !m) return;
      dernierRecu.current = Date.now();
      const p = partieRef.current;
      if (evenement === 'renvoi') {
        // l'invité a manqué le début : l'hôte le renvoie ; puis les actions qui lui manquent
        if (s.role === 'hote' && s.debut && (!p || m.p !== p.p || m.depuis < 0)) s.envoyer('jeu', s.debut);
        if (p && m.p === p.p) {
          journal.current.slice(Math.max(0, m.depuis)).forEach((x, k) => s.envoyer('jeu', { t: 'action', p: p.p, n: Math.max(0, m.depuis) + k, qui: x.qui, action: x.action }));
        }
        return;
      }
      if (evenement !== 'jeu') return;
      if (m.t === 'debut' && s.role === 'invite' && Array.isArray(m.roles) && m.roles.includes('invite')) {
        if (p && p.p >= m.p) return;   // déjà reçue
        commencer({ ...m, moi: m.roles.indexOf('invite') });
        return;
      }
      if (!p || m.p !== p.p) return;
      if (m.t === 'action') {
        if (m.qui === p.moi || !Number.isInteger(m.n)) return;   // mes actions ne viennent que de moi
        if (m.n < journal.current.length) return;   // déjà reçue
        if (m.n > journal.current.length) { s.envoyer('renvoi', { p: p.p, depuis: journal.current.length }); return; }
        journal.current.push({ qui: m.qui, action: m.action });
        setVersion((v) => v + 1);
      } else if (m.t === 'abandon') {
        partieRef.current = { ...p, fini: true, abandon: 1 - p.moi };
        setPartie(partieRef.current);
      }
    };
    s = ouvrirSalon(code, { discord_id: joueur.discord_id, nom: joueur.username ?? 'Aventurier', avatar: joueur.avatar_url ?? null, role, jeu: 'gemmes' }, {
      surPresence,
      surMessage,
      surErreur: (texte) => { if (salon.current === s) setVue((v) => ({ ...v, erreur: texte })); },
    });
    s.role = role;
    s.rafraichir = () => surPresence(s.liste());
    salon.current = s;
    s.annoncer({ cartes: cartesRef.current });
    setVue({ ...VIDE, code, role, texte: 'Connexion au salon…' });
  }, [joueur, quitter, lancer, commencer]);

  // Mes cartes changent dans le salon : l'autre les voit
  useEffect(() => { if (salon.current && !partieRef.current) salon.current.annoncer({ cartes }); }, [cartes]);

  const basculerPret = useCallback(async () => {
    const s = salon.current;
    if (!s) return;
    await s.annoncer({ pret: !s.presence.pret, cartes: cartesRef.current });
    s.rafraichir?.();
    setVue((v) => ({ ...v, pret: s.presence.pret, texte: texteSalon(s.role, s.cle, s.liste(), s.presence.pret) }));
  }, []);

  // Une de mes actions : dans le journal, puis à l'autre
  const jouer = useCallback((action) => {
    const s = salon.current, p = partieRef.current;
    if (!s || !p) return;
    const n = journal.current.length;
    journal.current.push({ qui: p.moi, action });
    s.envoyer('jeu', { t: 'action', p: p.p, n, qui: p.moi, action });
    setVersion((v) => v + 1);
  }, []);

  // La Table dit que la partie est finie (ou l'arrête) ; l'abandon prévient l'autre
  const finir = useCallback(() => {
    if (!partieRef.current || partieRef.current.fini) return;
    partieRef.current = { ...partieRef.current, fini: true };
    setPartie(partieRef.current);
  }, []);
  const abandonner = useCallback(() => {
    const s = salon.current, p = partieRef.current;
    if (!s || !p || p.fini) return;
    s.envoyer('jeu', { t: 'abandon', p: p.p });
    partieRef.current = { ...p, fini: true, abandon: p.moi };
    setPartie(partieRef.current);
  }, []);
  const revanche = useCallback(async () => {
    const s = salon.current, p = partieRef.current;
    if (!s || !p?.fini) return;
    await s.annoncer({ revanche: p.p, cartes: cartesRef.current });
    s.rafraichir?.();
  }, []);

  // Rattraper les messages perdus, et l'adversaire parti trop longtemps
  useEffect(() => {
    const minuteur = setInterval(() => {
      const s = salon.current, p = partieRef.current;
      if (!s) return;
      if (!p && s.role === 'invite' && s.presence.pret && s.liste().some((x) => x.cle !== s.cle && x.pret)) {
        s.envoyer('renvoi', { p: 0, depuis: -1 });
      } else if (p && !p.fini && Date.now() - dernierRecu.current > 6000) {
        dernierRecu.current = Date.now();
        s.envoyer('renvoi', { p: p.p, depuis: journal.current.length });
      }
      if (p && !p.fini && absentDepuis.current && Date.now() - absentDepuis.current > DELAI_RETOUR) {
        absentDepuis.current = null;
        partieRef.current = { ...p, fini: true, abandon: 1 - p.moi };
        setPartie(partieRef.current);
      }
    }, 3000);
    return () => clearInterval(minuteur);
  }, []);

  // En quittant l'écran : on quitte le salon
  useEffect(() => () => { salon.current?.fermer(); salon.current = null; }, []);

  return { vue, partie, version, journal, entrer, quitter, basculerPret, jouer, finir, abandonner, revanche, estHote };
}
