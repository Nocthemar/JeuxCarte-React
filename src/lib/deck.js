// =====================================================================
//  Le deck du profil : 5 cartes mises en avant, renommable (ancien chargerDeck et classe Deck de JS/cartes.js)
//  (lisible par tous ; modifiable par son propriétaire : set_deck, rename_deck)
//
//  const deck = useDeck(discordId);
//    deck.deck : null pendant le chargement, puis { nom, ids: [5 ids ou null], cartes: Map id -> carte }
//    deck.placer(id, position, carte), deck.basculer(id, carte), deck.retirer(position), deck.renommer(nom)
//  Chaque changement s'affiche tout de suite, puis est enregistré ; en cas d'erreur, on revient en arrière.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { useNotifier } from './notification.js';

export const DECK_MAX = 5;
export const NOM_DECK_DEFAUT = 'Deck de cartes';

export async function chargerDeck(discordId) {
  const [{ data: deck }, { data: lignes }] = await Promise.all([
    supabase.from('player_decks').select('name').eq('discord_id', discordId).maybeSingle(),
    supabase.from('player_deck_cards').select('position, card:cards(*)').eq('discord_id', discordId),
  ]);
  const ids = Array(DECK_MAX).fill(null);
  const cartes = new Map();
  for (const { position, card } of lignes ?? []) {
    if (!card) continue;
    ids[position - 1] = card.id;
    cartes.set(card.id, card);
  }
  return { nom: deck?.name ?? NOM_DECK_DEFAUT, ids, cartes };
}

export function useDeck(discordId) {
  const notifier = useNotifier();
  const [etat, setEtat] = useState({ pour: null, deck: null });   // le deck, et le joueur à qui il est
  const courant = useRef(null);   // le dernier deck affiché (pour enchaîner les changements)

  useEffect(() => {
    if (!discordId) return undefined;
    let actif = true;
    chargerDeck(discordId).then((deck) => { if (actif) setEtat({ pour: discordId, deck }); });
    return () => { actif = false; };
  }, [discordId]);

  const deck = etat.pour === discordId ? etat.deck : null;
  useEffect(() => { courant.current = deck; });

  const changer = (nouveau) => { courant.current = nouveau; setEtat({ pour: discordId, deck: nouveau }); };
  // Affiche tout de suite les nouveaux emplacements, puis les enregistre (retour en arrière si refus)
  const enregistrer = async (ids, cartes) => {
    const avant = courant.current;
    changer({ ...avant, ids, cartes });
    const { error } = await supabase.rpc('set_deck', { p_card_ids: ids });
    if (error) {
      changer(avant);
      notifier(error.message, 'erreur');
    }
  };

  // Met une carte à la position donnée. Si elle était déjà dans le deck, les deux échangent leur place ;
  // sinon elle remplace la carte présente.
  const placer = (id, position, carte) => {
    const d = courant.current;
    if (!d) return;
    const cartes = new Map(d.cartes);
    if (carte) cartes.set(id, carte);
    const ancienne = d.ids.indexOf(id);
    if (ancienne === position) return;
    const ids = [...d.ids];
    if (ancienne >= 0) ids[ancienne] = ids[position];
    ids[position] = id;
    return enregistrer(ids, cartes);
  };
  const retirer = (position) => {
    const d = courant.current;
    if (!d) return;
    const ids = [...d.ids];
    ids[position] = null;
    return enregistrer(ids, d.cartes);
  };
  // Ajoute la carte au premier emplacement libre, ou l'enlève si elle y est déjà
  const basculer = (id, carte) => {
    const d = courant.current;
    if (!d) return;
    const i = d.ids.indexOf(id);
    if (i >= 0) return retirer(i);
    const libre = d.ids.indexOf(null);
    if (libre < 0) {
      notifier(`Ton deck est complet (${DECK_MAX} cartes). Retires-en une d'abord.`, 'erreur');
      return;
    }
    return placer(id, libre, carte);
  };
  // Renomme le deck ; renvoie vrai si c'est fait
  const renommer = async (nom) => {
    const { data, error } = await supabase.rpc('rename_deck', { p_name: nom });
    if (error) { notifier(error.message, 'erreur'); return false; }
    changer({ ...courant.current, nom: data });
    notifier('Deck renommé.');
    return true;
  };

  return { deck, placer, retirer, basculer, renommer, contient: (id) => !!deck?.ids.includes(id) };
}
