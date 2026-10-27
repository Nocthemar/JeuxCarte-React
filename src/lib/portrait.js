// =====================================================================
//  Le portrait des comptes e-mail (supabase/avatars.sql) : une image choisie sur l'appareil du joueur.
//  Elle est recadrée en carré au centre et réduite à 256 px dans le navigateur (le fichier d'origine,
//  ses dimensions et ses informations cachées, comme le lieu de la photo, ne partent jamais),
//  déposée dans le stockage « avatars » (dossier du joueur), puis mise sur son profil par changer_avatar.
//  Les anciennes images du dossier sont ensuite effacées.
// =====================================================================
import { supabase } from './supabase.js';

const COTE = 256;
const MAX_ORIGINE = 15 * 1024 * 1024;   // une photo de téléphone tient largement en dessous

// L'image choisie -> un carré de 256 px (webp, ou png si le navigateur ne sait pas faire de webp)
async function preparer(fichier) {
  if (!fichier?.type?.startsWith('image/')) throw new Error('Choisis une image (photo, dessin…).');
  if (fichier.size > MAX_ORIGINE) throw new Error('Cette image est trop lourde (15 Mo au plus).');
  let image;
  try { image = await createImageBitmap(fichier); } catch { throw new Error('Cette image ne s’ouvre pas : essaie un autre fichier.'); }
  const c = Math.min(image.width, image.height), toile = document.createElement('canvas');
  toile.width = toile.height = COTE;
  const ctx = toile.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (image.width - c) / 2, (image.height - c) / 2, c, c, 0, 0, COTE, COTE);
  image.close?.();
  const blob = await new Promise((ok) => toile.toBlob(ok, 'image/webp', 0.86));
  if (!blob) throw new Error('Impossible de préparer cette image.');
  return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'png' };
}

// Les images du dossier du joueur, sauf « garder »
async function effacerAnciens(discordId, garder = null) {
  const { data } = await supabase.storage.from('avatars').list(discordId, { limit: 20 });
  const noms = (data ?? []).map((f) => `${discordId}/${f.name}`).filter((n) => n !== garder);
  if (noms.length) await supabase.storage.from('avatars').remove(noms);
}

// Choisir un nouveau portrait : renvoie son adresse
export async function changerPortrait(discordId, fichier) {
  const { blob, ext } = await preparer(fichier);
  const nom = `${discordId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(nom, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) {
    throw new Error(/bucket|not found/i.test(error.message)
      ? 'Les portraits ne sont pas encore installés (supabase/avatars.sql).' : 'L’envoi de l’image a échoué : réessaie.');
  }
  const url = supabase.storage.from('avatars').getPublicUrl(nom).data.publicUrl;
  const r = await supabase.rpc('changer_avatar', { p_url: url });
  if (r.error) {
    await supabase.storage.from('avatars').remove([nom]);
    throw new Error(r.error.message || 'Ce portrait n’a pas pu être enregistré.');
  }
  await effacerAnciens(discordId, nom).catch(() => {});
  return url;
}

// Retirer son portrait
export async function retirerPortrait(discordId) {
  const { error } = await supabase.rpc('changer_avatar', { p_url: null });
  if (error) throw new Error(error.message || 'Impossible de retirer ton portrait.');
  await effacerAnciens(discordId).catch(() => {});
}

// Avant de supprimer son compte : ses images ne doivent pas rester en ligne
export const effacerMesPortraits = (discordId) => effacerAnciens(discordId).catch(() => {});
