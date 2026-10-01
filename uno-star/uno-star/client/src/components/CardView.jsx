import React from 'react';
import { isWild, isPenalty, isAction, isNumber } from '@uno-star/shared/cards';

function symbolOf(card) {
  if (!card) return '';
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'penalty') return `+${card.value}`;
  if (card.kind === 'action') return card.value === 'skip' ? '\u21e0' : '\u21ba';
  return '\u2605';
}

function labelOf(card) {
  if (!card) return '';
  if (card.kind === 'action') return card.value === 'skip' ? 'PASS' : 'RETOUR';
  if (card.kind === 'wild') return 'JOKER';
  return '';
}

/**
 * Carte originale : anneau de couleur + panneau blanc central.
 * Aucune ressource externe, tout est en CSS/SVG.
 */
export default function CardView({
  card = null,
  faceDown = false,
  selected = false,
  playable = false,
  dimmed = false,
  size = 'md',
  onClick,
  style,
  title,
  className = '',
  index,
  total,
}) {
  const color = isWild(card) ? 'wild' : card?.color || 'wild';
  const playableCls = playable ? ' is-playable' : '';
  const selectedCls = selected ? ' is-selected' : '';
  const dimCls = dimmed ? ' is-dimmed' : '';

  // legere rotation en eventail
  let transformStyle = style;
  if (!transformStyle && typeof index === 'number' && typeof total === 'number' && total > 1) {
    const spread = Math.min(total, 9);
    const step = Math.min(7, 42 / spread);
    const rot = (index - (spread - 1) / 2) * step;
    transformStyle = { transform: `rotate(${rot}deg)`, zIndex: index };
  }

  return (
    <button
      type="button"
      className={`card card--${size} card--${color}${playableCls}${selectedCls}${dimCls} ${className}`}
      style={transformStyle}
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      aria-label={card ? `Carte ${card.kind} ${card.value} ${color}` : faceDown ? 'Carte dos' : 'Carte'}
      title={title}
    >
      {faceDown ? (
        <span className="card__back" aria-hidden="true">
          <span className="card__back-mark">★</span>
        </span>
      ) : (
        <>
          <span className="card__corner card__corner--tl">{symbolOf(card)}</span>
          <span className="card__panel">
            <span className="card__symbol">{symbolOf(card)}</span>
            {labelOf(card) ? <span className="card__label">{labelOf(card)}</span> : null}
          </span>
          <span className="card__corner card__corner--br">{symbolOf(card)}</span>
          {isPenalty(card) ? <span className="card__badge">+{card.value}</span> : null}
          {isWild(card) ? <span className="card__wild-note">COULEUR AU CHOIX</span> : null}
          {isNumber(card) ? <span className="card__pip" aria-hidden="true" /> : null}
          {isAction(card) ? <span className="card__action-note">ACTION</span> : null}
        </>
      )}
    </button>
  );
}