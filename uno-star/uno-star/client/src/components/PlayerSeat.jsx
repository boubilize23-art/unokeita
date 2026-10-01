import React from 'react';
import Avatar from './Avatar.jsx';
import CardView from './CardView.jsx';

/**
 * Siege d'un adversaire : avatar, nom, nombre de cartes, indicateur de tour,
 * drapeaux UNO / deconnexion, bouton de signalement.
 */
export default function PlayerSeat({
  player,
  isTurn = false,
  canCatch = false,
  onCatch,
  style,
  compact = false,
}) {
  const state = [];
  if (!player.connected) state.push('offline');
  if (player.uno && player.unoCalled) state.push('uno-called');
  if (player.uno && !player.unoCalled) state.push('uno-missing');
  if (player.unoPenalized) state.push('uno-penalized');

  return (
    <div className={`seat${isTurn ? ' is-turn' : ''} seat--${state.join(' ') || 'idle'}`} style={style}>
      {isTurn ? <span className="seat__turn-ring" aria-hidden="true" /> : null}
      <div className="seat__top">
        <div className="seat__avatar">
          <Avatar id={player.avatar} size={compact ? 34 : 44} title={player.name} />
          <span className="seat__count" aria-label={`${player.cardCount} cartes`}>
            {player.cardCount}
          </span>
          {isTurn ? <span className="seat__arrow" aria-hidden="true">▾</span> : null}
        </div>
        <div className="seat__meta">
          <span className="seat__name" title={player.name}>
            {player.name}
            {player.isHost ? <span className="seat__crown" title="Hôte">★</span> : null}
          </span>
          <span className="seat__status">
            {!player.connected
              ? 'déconnecté'
              : player.unoCalled
                ? 'UNO ✓'
                : player.uno
                  ? 'à announce UNO'
                  : `${player.cardCount} carte${player.cardCount > 1 ? 's' : ''}`}
          </span>
        </div>
      </div>
      <div className="seat__cards">
        {Array.from({ length: Math.min(player.cardCount, compact ? 4 : 6) }).map((_, i) => (
          <CardView key={i} faceDown size="xs" className="seat__card" />
        ))}
        {player.cardCount > 6 ? <span className="seat__more">+{player.cardCount - 6}</span> : null}
      </div>
      {canCatch && player.uno && !player.unoCalled && player.connected ? (
        <button type="button" className="btn btn--tiny btn--danger" onClick={onCatch}>
          🗣 Signaler UNO
        </button>
      ) : null}
    </div>
  );
}