// =====================================================================
//  Fournit notifier() à toute l'application et affiche le bandeau #notif
//  (style : .notif, .notif--ok, .notif--erreur, .notif--visible, selon la page)
//  Chaque message a son petit son, discret : une pose douce quand une action réussit (achat, échange,
//  récompense…), un son d'échec quand elle est refusée (lib/son.js : coupé si le joueur a coupé le son).
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { NotificationContext } from '../lib/notification.js';
import { jouerSon } from '../lib/son.js';

const DUREE = 4000;

export default function Notifications({ children }) {
  const [notif, setNotif] = useState({ message: '', type: 'ok', visible: false });
  const minuteur = useRef(null);

  const notifier = useCallback((message, type = 'ok') => {
    setNotif({ message, type, visible: true });
    jouerSon(type === 'erreur' ? 'echec' : 'pose');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setNotif((n) => ({ ...n, visible: false })), DUREE);
  }, []);
  useEffect(() => () => clearTimeout(minuteur.current), []);

  return (
    <NotificationContext.Provider value={notifier}>
      {children}
      <div id="notif" className={`notif notif--${notif.type}${notif.visible ? ' notif--visible' : ''}`} role="status" aria-live="polite">
        {notif.message}
      </div>
    </NotificationContext.Provider>
  );
}
