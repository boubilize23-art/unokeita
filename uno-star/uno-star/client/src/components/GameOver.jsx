import React from 'react';
import Avatar from './Avatar.jsx';

export default function GameOver({ state, isHost, onReplay, onQuit, onBackToLobby }) {
  const ranking = state.ranking || [];
  const winner = ranking[0];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Fin de partie">
      <div className="modal modal--win">
        <div className="win-burst" aria-hidden="true" />
        <h2 className="win__title">🎉 {winner ? winner.name : 'Partie terminée'}</h2>
        <p className="win__sub">remporte la manche !</p>

        <ol className="ranking">
          {ranking.map((r) => (
            <li key={r.id} className={`ranking__row${r.rank === 1 ? ' is-first' : ''}`}>
              <span className="ranking__pos">{r.rank}</span>
              <Avatar id={r.avatar} size={34} />
              <span className="ranking__name">{r.name}</span>
              <span className="ranking__cards">{r.cards} carte{r.cards > 1 ? 's' : ''}</span>
            </li>
          ))}
        </ol>

        <div className="modal__actions">
          {isHost ? (
            <button type="button" className="btn btn--primary" onClick={onReplay}>
              🔁 Rejouer
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={onBackToLobby}>
              ⏳ En attente de l'hôte…
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onQuit}>
            Quitter la partie
          </button>
        </div>
        {!isHost ? <p className="muted small">L'hôte peut relancer une nouvelle manche.</p> : null}
      </div>
    </div>
  );
}