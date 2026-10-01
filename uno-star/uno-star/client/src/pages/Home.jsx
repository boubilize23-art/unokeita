import React, { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { AVATARS, normalizeRoomCode } from '@uno-star/shared/room';
import { RULES_SUMMARY } from '@uno-star/shared/constants';

export default function Home({ profile, setProfile, onCreate, onJoin, busy, error, serverUrl }) {
  const [mode, setMode] = useState('home');
  const [code, setCode] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const payload = { name: profile.name, avatar: profile.avatar };
    if (mode === 'create') onCreate(payload);
    else if (mode === 'join') onJoin({ ...payload, code: normalizeRoomCode(code) });
  };

  return (
    <div className="home">
      <div className="home__bg" aria-hidden="true" />
      <div className="home__card">
        <header className="home__head">
          <div className="logo">
            <span className="logo__mark">★</span>
            <div>
              <h1 className="logo__title">UNO STACK</h1>
              <p className="logo__sub">Cartes multijoueur · 2 à 7 joueurs</p>
            </div>
          </div>
        </header>

        <form onSubmit={submit} className="home__form">
          <label className="field">
            <span className="field__label">Ton pseudo</span>
            <input
              className="field__input"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value.slice(0, 16) })}
              placeholder="Ex. Camille"
              maxLength={16}
              autoComplete="nickname"
              required
            />
          </label>

          <div className="field">
            <span className="field__label">Avatar</span>
            <div className="avatar-picker">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`avatar-pick${profile.avatar === a.id ? ' is-active' : ''}`}
                  onClick={() => setProfile({ ...profile, avatar: a.id })}
                  aria-label={a.name}
                  title={a.name}
                >
                  <Avatar id={a.id} size={40} />
                </button>
              ))}
            </div>
          </div>

          {mode === 'join' ? (
            <label className="field">
              <span className="field__label">Code de la salle</span>
              <input
                className="field__input field__input--code"
                value={code}
                onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
                placeholder="ABC123"
                maxLength={6}
                inputMode="text"
                autoCapitalize="characters"
                required
              />
            </label>
          ) : null}

          {error ? <p className="alert alert--error">{error}</p> : null}

          {serverUrl ? null : (
            <p className="alert alert--warn">
              ⚠️ Aucune URL de serveur détectée. Renseigne <code>VITE_WS_URL</code> (voir .env.example) pour
              connecter le jeu en production.
            </p>
          )}

          <div className="home__actions">
            {mode === 'home' ? (
              <>
                <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={() => setMode('create')}>
                  🎴 Créer une partie
                </button>
                <button type="button" className="btn btn--ghost btn--lg" disabled={busy} onClick={() => setMode('join')}>
                  🔑 Rejoindre avec un code
                </button>
              </>
            ) : (
              <>
                <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
                  {busy ? 'Connexion…' : mode === 'create' ? 'Créer la salle' : 'Rejoindre la salle'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setMode('home')} disabled={busy}>
                  Retour
                </button>
              </>
            )}
          </div>
        </form>

        <section className="rules">
          <h2 className="rules__title">Les règles en 5 lignes</h2>
          <ul>
            {RULES_SUMMARY.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
