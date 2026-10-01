import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clearSession, connect, loadSession, resolveServerUrl, saveSession } from './lib/socket.js';
import { PHASE } from '@uno-star/shared/constants';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import GameTable from './pages/Game.jsx';

const PROFILE_KEY = 'uno-stack:profile';

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.name) return p;
    }
  } catch {
    /* ignore */
  }
  return { name: '', avatar: 'fox' };
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState('home');
  const socketRef = useRef(null);
  const serverUrl = useMemo(() => resolveServerUrl(), []);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile]);

  /** Envoie une intention au serveur et attend son verdict. */
  const emit = useCallback((event, payload = {}) => {
    return new Promise((resolve) => {
      const sock = socketRef.current;
      if (!sock || !sock.connected) {
        resolve({ error: 'Connexion au serveur impossible.' });
        return;
      }
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ error: 'Le serveur ne répond pas.' });
      }, 12_000);
      sock.emit(event, payload, (res) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res || {});
      });
    });
  }, []);

  // Connexion + reconnexion automatique
  useEffect(() => {
    const sock = connect();
    socketRef.current = sock;
    if (!sock) {
      setError("Serveur temps réel non configuré (VITE_WS_URL). Voir .env.example.");
      return undefined;
    }

    sock.on('connect', () => {
      setConnected(true);
      // tentative de reconnexion a la salle memorisee
      const session = loadSession();
      if (session) {
        sock.emit('room:resume', session, (res) => {
          if (res?.ok) {
            setState(res.state);
            setScreen('room');
            setNotice('Connexion rétablie — ta place a été conservée.');
            setTimeout(() => setNotice(''), 4000);
          } else {
            clearSession();
            setError(res?.error || 'Session expirée.');
          }
        });
      }
    });

    sock.on('disconnect', () => setConnected(false));
    sock.on('room:state', (next) => setState(next));
    sock.on('room:event', () => setState((prev) => ({ ...prev })));

    return () => {
      sock.close();
      socketRef.current = null;
    };
  }, []);

  // Le nouveau joueur qui arrive sur un lien partage est pre-rempli
  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room');
    if (room) {
      sessionStorage.setItem('uno-stack:prefill-room', room.toUpperCase());
    }
  }, []);

  const handleError = (res) => {
    if (res?.error) {
      setError(res.error);
      setTimeout(() => setError(''), 4500);
      return true;
    }
    return false;
  };

  const actions = useMemo(
    () => ({
      async create(payload) {
        setBusy(true);
        const res = await emit('room:create', { ...payload, config: {} });
        setBusy(false);
        if (handleError(res)) return;
        saveSession({ code: res.code, token: res.token });
        setState(res.state);
        setScreen('room');
      },
      async join(payload) {
        setBusy(true);
        const res = await emit('room:join', payload);
        setBusy(false);
        if (handleError(res)) return;
        saveSession({ code: res.code, token: res.token });
        setState(res.state);
        setScreen('room');
      },
      setReady: (ready) => emit('room:ready', { ready }),
      start: () => emit('room:start', {}),
      removePlayer: (playerId) => emit('room:removePlayer', { playerId }),
      setConfig: (patch) => emit('room:config', patch),
      play: (cardIds, color) => emit('game:play', { cardIds, color }),
      draw: () => emit('game:draw', {}),
      pass: () => emit('game:pass', {}),
      uno: () => emit('game:uno', {}),
      catchUno: (playerId) => emit('game:catchUno', { playerId }),
      replay: () => emit('game:replay', {}),
      async leave() {
        await emit('room:leave', {});
        clearSession();
        setState(null);
        setScreen('home');
      },
    }),
    [emit],
  );

  // ecran lobby quand la partie n'a pas commence, table sinon
  const view = !state ? (
    <Home
      profile={profile}
      setProfile={setProfile}
      onCreate={actions.create}
      onJoin={actions.join}
      busy={busy}
      error={error}
      serverUrl={serverUrl}
      prefillRoom={sessionStorage.getItem('uno-stack:prefill-room')}
    />
  ) : state.status === PHASE.LOBBY && screen === 'room' ? (
    <Lobby state={state} actions={actions} error={error} />
  ) : (
    <GameTable state={state} actions={actions} error={error} connected={connected} />
  );

  return (
    <div className="app">
      {!connected && serverUrl ? <div className="banner banner--offline">Connexion au serveur…</div> : null}
      {notice ? <div className="banner banner--info">{notice}</div> : null}
      {view}
    </div>
  );
}