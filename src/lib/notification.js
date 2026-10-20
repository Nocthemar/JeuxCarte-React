// =====================================================================
//  Le bandeau de notification (#notif) qui disparaît tout seul (ancien notifier() de JS/commun.js)
//  Dans un composant : const notifier = useNotifier(); notifier('Lien copié'); notifier('Oups', 'erreur');
// =====================================================================
import { createContext, useContext } from 'react';

export const NotificationContext = createContext(() => {});
export const useNotifier = () => useContext(NotificationContext);
