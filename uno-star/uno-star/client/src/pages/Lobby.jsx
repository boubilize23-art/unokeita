import React, { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { PHASE } from '@uno-star/shared/constants';

export default function Lobby({ state, actions, error }) {
  const [copied, setCopied] = useState(false);
  const me = state.me;
  const isHost = me?.isHost;
  const everyoneReady = state.players.length >= state.config.minPlayers && state.players.every((p) => p.ready);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = `${window.location.origin}?room=${state.code}`;

  return (
    <div className="lobby">
      <div className="lobby__head">
        <div>
          <h2 className="lobby__title">Salle de jeu</h2>
          <p className="lobby__sub">
            Partie {state.status === PHASE.PLAYING ? 'en cours' : 'en attente'} · {state.players.length}/
            {state.config.maxPlayers} joueurs
          </p>
        </div>
        <button type="button" className="roomcode" onClick={copyCode} title="Copier le code">
          <span className="roomcode__label">Code</span>
          <span className="roomcode__value">{state.code}</span>
          <span className="roomcode__hint">{copied ? '✓ copié' : 'cliquer pour copier'}</span>
        </button>
      </div>

      <div className="lobby__grid">
        <section className="panel">
          <h3 className="panel__title">Joueurs</h3>
          <ul className="players">
            {state.players.map((p) => (
              <li key={p.id} className={`players__row${p.isMe ? ' is-me' : ''}${p.connected ? '' : ' is-offline'}`}>
                <Avatar id={p.avatar} size={42} />
                <div className="players__meta">
                  <span className="players__name">
                    {p.name}
                    {p.isMe ? <em className="tag tag--me">vous</em> : null}
                    {p.isHost ? <em className="tag tag--host">hôte</em> : null}
                  </span>
                  <span className="players__status">
                    {!p.connected ? 'déconnecté' : p.ready ? 'prêt' : 'en attente'}
                  </span>
                </div>
                {isHost && !p.isMe && !p.connected ? (
                  <button type="button" className="btn btn--tiny btn--danger" onClick={() => actions.removePlayer(p.id)}>
                    Retirer
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="lobby__actions">
            <button
              type="button"
              className={`btn ${me?.ready ? 'btn--ghost' : 'btn--primary'} btn--lg`}
              onClick={() => actions.setReady(!me?.ready)}
              disabled={state.status !== PHASE.LOBBY}
            >
              {me?.ready ? '✋ En attente… (annuler)' : '✅ Je suis prêt'}
            </button>
            {isHost ? (
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={actions.start}
                disabled={!everyoneReady}
                title={everyoneReady ? '' : 'Tous les joueurs doivent être prêts'}
              >
                🚀 Démarrer la partie
              </button>
            ) : (
              <p className="muted">En attente du démarrage par l'hôte…</p>
            )}
          </div>
          {error ? <p className="alert alert--error">{error}</p> : null}
        </section>

        <section className="panel">
          <h3 className="panel__title">Réglages {isHost ? '(hôte)' : ''}</h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={state.config.unoRequired}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ unoRequired: e.target.checked })}
            />
            <span>Règle UNO obligatoire</span>
          </label>
          <label className="switch">
            <span className="switch__label">Cartes par joueur</span>
            <input
              type="number"
              min={3}
              max={15}
              value={state.config.handSize}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ handSize: e.target.value })}
            />
          </label>
          <label className="switch">
            <span className="switch__label">Pénalité si UNO non crié</span>
            <input
              type="number"
              min={0}
              max={10}
              value={state.config.unoMissPenalty}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ unoMissPenalty: e.target.value })}
            />
          </label>
          <label className="switch">
            <span className="switch__label">Délai pour crier UNO (s)</span>
            <input
              type="number"
              min={2}
              max={20}
              value={Math.round(state.config.unoWindowMs / 1000)}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ unoWindowMs: Number(e.target.value) * 1000 })}
            />
          </label>
          <label className="switch">
            <span className="switch__label">Temps de tour (s)</span>
            <input
              type="number"
              min={10}
              max={180}
              value={Math.round(state.config.turnTimerMs / 1000)}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ turnTimerMs: Number(e.target.value) * 1000 })}
            />
          </label>
          <label className="switch">
            <span className="switch__label">Délai si joueur déconnecté (s)</span>
            <input
              type="number"
              min={2}
              max={60}
              value={Math.round((state.config.disconnectedTurnTimerMs || 8000) / 1000)}
              disabled={!isHost}
              onChange={(e) => actions.setConfig({ disconnectedTurnTimerMs: Number(e.target.value) * 1000 })}
            />
          </label>
          <p className="muted small">
            Partagez ce lien : <a href={shareLink}>{shareLink}</a>
          </p>
          <button type="button" className="btn btn--ghost" onClick={actions.leave}>
            Quitter la salle
          </button>
        </section>
      </div>
    </div>
  );
}