// =====================================================================
//  Le chargement, dans le style du jeu : un losange de Nocthémar qui tourne doucement et un texte court.
//  N'apparaît qu'après un court délai (250 ms) : un chargement rapide ne montre rien, sans clignotement.
//  <Chargement texte="Le marchand déballe ses boosters…" />   (styles/ecrans-commun.css)
// =====================================================================
export default function Chargement({ texte = 'Un instant…', className = '' }) {
  return (
    <p className={`chargement-jeu ${className}`} role="status" aria-live="polite">
      <span className="chargement-jeu__rune" aria-hidden="true"><i /></span>
      <span>{texte}</span>
    </p>
  );
}
