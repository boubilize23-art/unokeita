import React, { useEffect, useMemo, useRef, useState } from 'react';
import CardView from '../components/CardView.jsx';
import PlayerSeat from '../components/PlayerSeat.jsx';
import ColorPicker from '../components/ColorPicker.jsx';
import GameOver from '../components/GameOver.jsx';
import { createContext, getPlayableCards, isValidTurn } from '@uno-star/shared/rules';
import { describeCard } from '@uno-star/shared/cards';
import { PHASE } from '@uno-star/shared/constants';
import { isMuted, setMuted, sfx } from '../lib/sfx.js';

/** Positions des adversaires autour de la table (%). */
const SEAT_SLOTS = {
  1: [{ l: 50, t: 15 }],
  2: [{ l: 16, t: 50 }, { l: 84, t: 50 }],
  3: [{ l: 50, t: 16 }, { l: 15, t: 52 }, { l: 85, t: 52 }],
  4: [{ l: 24, t: 20 }, { l: 76, t: 20 }, { l: 14, t: 66 }, { l: 86, t: 66 }],
  5: [{ l: 24, t: 16 }, { l: 50, t: 16 }, { l: 76, t: 16 }, { l: 12, t: 62 }, { l: 88, t: 62 }],
  6: [
    { l: 24, t: 14 },
    { l: 50, t: 14 },
    { l: 76, t: 14 },
    { l: 12, t: 54 },
    { l: 88, t: 54 },
    { l: 50, t: 82 },
  ],
};

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e) => setMatches(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Deconte le temps restant en se basant sur l'horloge du serveur. */
function useCountdown(deadline, serverTime) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline || !serverTime) {
      setLeft(0);
      return undefined;
    }
    const total = Math.max(0, deadline - serverTime);
    setLeft(total);
    const start = Date.now();
    const t = setInterval(() => {
      setLeft(Math.max(0, total - (Date.now() - start)));
    }, 250);
    return () => clearInterval(t);
  }, [deadline, serverTime]);
  return left;
}

export default function GameTable({ state, actions, error, connected }) {
  const me = state.me;
  const table = state.table;
  const isMyTurn = table.currentPlayerId === me?.id;
  const [selected, setSelected] = useState([]);
  const [colorModal, setColorModal] = useState(null);
  const [fx, setFx] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const compact = useMediaQuery('(max-width: 900px)');
  const lastSeq = useRef(0);
  const handRef = useRef(null);

  // effets a chaque evenement serveur
  useEffect(() => {
    const ev = state.lastEvent;
    if (!ev || ev.seq === lastSeq.current) return;
    lastSeq.current = ev.seq;
    setFx({ type: ev.type, id: ev.seq, color: ev.color, amount: ev.amount });
    if (ev.type === 'play') sfx.play();
    else if (ev.type === 'draw') sfx.draw();
    else if (ev.type === 'penalty' || ev.type === 'penalty-draw') sfx.penalty();
    else if (ev.type === 'uno' || ev.type === 'uno-penalty') sfx.uno();
    else if (ev.type === 'win') sfx.win();
    const t = setTimeout(() => setFx(null), 1600);
    return () => clearTimeout(t);
  }, [state.lastEvent]);

  // on repousse la main vers la carte ajoutee
  useEffect(() => {
    if (handRef.current && me?.hand?.length) {
      handRef.current.scrollLeft = handRef.current.scrollWidth;
    }
  }, [me?.hand?.length, me?.id]);

  const ctx = useMemo(
    () =>
      createContext({
        topCard: table.topCard,
        activeColor: table.activeColor,
        pendingPenalty:
          table.pendingPenalty > 0 ? { total: table.pendingPenalty, lastValue: table.pendingLastValue } : null,
        config: state.config,
        hand: me?.hand || [],
      }),
    [table.topCard, table.activeColor, table.pendingPenalty, table.pendingLastValue, state.config, me?.hand],
  );

  const playableIds = useMemo(() => new Set(getPlayableCards(me?.hand || [], ctx).map((c) => c.id)), [me?.hand, ctx]);
  const selectedCards = useMemo(
    () => (me?.hand || []).filter((c) => selected.includes(c.id)),
    [me?.hand, selected],
  );
  const verdict = useMemo(
    () => (selectedCards.length ? isValidTurn(selectedCards, ctx) : null),
    [selectedCards, ctx],
  );

  // reinitialise la selection a chaque changement de tour
  useEffect(() => {
    setSelected([]);
    setColorModal(null);
  }, [table.currentPlayerId]);

  const toggle = (card) => {
    sfx.select();
    setSelected((prev) => (prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]));
    setColorModal(null);
  };

  const timeLeft = useCountdown(table.turnDeadline, state.serverTime);
  const turnRatio = state.config.turnTimerMs ? Math.min(1, timeLeft / state.config.turnTimerMs) : 0;

  const opponents = (state.players || []).filter((p) => p.id !== me?.id);
  const ordered = useMemo(() => {
    if (!me) return opponents;
    const myIdx = state.players.findIndex((p) => p.id === me.id);
    const dir = table.direction === -1 ? -1 : 1;
    const rest = state.players.filter((p) => p.id !== me.id);
    // parcours dans l'ordre du jeu a partir du suivant
    const orderedIds = [];
    for (let i = 1; i < state.players.length; i += 1) {
      const idx = (myIdx + dir * i + state.players.length * 2) % state.players.length;
      const p = state.players[idx];
      if (p && p.id !== me.id) orderedIds.push(p.id);
    }
    const map = new Map(rest.map((p) => [p.id, p]));
    return orderedIds.map((id) => map.get(id)).filter(Boolean);
  }, [state.players, me, table.direction]);

  const slots = SEAT_SLOTS[Math.max(1, ordered.length)] || SEAT_SLOTS[6];

  const doPlay = async (color) => {
    setColorModal(null);
    if (!verdict?.ok) return;
    const res = await actions.play(selectedCards.map((c) => c.id), color);
    if (res?.error) {
      setSelected([]);
      sfx.error();
    }
  };

  const submit = () => {
    if (!verdict?.ok) return;
    const options = verdict.colorOptions || [];
    if (options.length > 1) {
      setColorModal({ colors: options });
      return;
    }
    doPlay(options[0]);
  };

  const pending = table.pendingPenalty || 0;
  const unoAvailable = !!me && me.hand.length === 1 && me.unoState && !me.unoState.called && !me.unoState.penalized;

  return (
    <div className={`game${fx ? ` fx-${fx.type}` : ''}`}>
      <header className="game__bar">
        <div className="game__brand">
          <span className="logo__mark logo__mark--sm">★</span>
          <strong>UNO STACK</strong>
          <span className="game__room" title="Code de la salle">
            {state.code}
          </span>
        </div>
        <div className="game__meta">
          <span className={`pill pill--dir`} title="Sens de jeu">
            {table.direction === 1 ? '↻' : '↺'}
          </span>
          <span className={`pill pill--color pill--${table.activeColor || 'wild'}`}>
            Couleur active : {table.activeColor || '—'}
          </span>
          <span className="pill">Pioche : {table.deckCount}</span>
          <button
            type="button"
            className="btn btn--tiny btn--ghost"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            title="Couper / activer le son"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="btn btn--tiny btn--ghost" onClick={actions.leave}>
            Quitter
          </button>
        </div>
      </header>

      {error ? <div className="banner banner--error">{error}</div> : null}
      {!connected ? <div className="banner banner--offline">Connexion perdue — tentative de reconnexion…</div> : null}

      <div className="table">
        <div className="table__felt" aria-hidden="true" />
        <div className="table__ring" aria-hidden="true" />

        {/* adversaires — desktop : autour de la table, mobile : bandeau horizontal */}
        {compact ? (
          <div className="seats-sep">
            {ordered.map((p) => (
              <PlayerSeat
                key={p.id}
                player={p}
                compact
                isTurn={p.id === table.currentPlayerId}
                canCatch={isMyTurn && me?.hand?.length !== 1}
                onCatch={() => actions.catchUno(p.id)}
              />
            ))}
          </div>
        ) : (
          ordered.map((p, i) => (
            <PlayerSeat
              key={p.id}
              player={p}
              isTurn={p.id === table.currentPlayerId}
              canCatch={isMyTurn && p.uno && !p.unoCalled}
              onCatch={() => actions.catchUno(p.id)}
              style={{ left: `${slots[i]?.l ?? 50}%`, top: `${slots[i]?.t ?? 50}%` }}
            />
          ))
        )}

        {/* centre : pile de defausse + pioche */}
        <div className="center">
          <div className="center__stack">
            <div className="deck" title={`Pioche : ${table.deckCount} cartes`}>
              <CardView faceDown size="lg" className="deck__card" />
              <CardView faceDown size="lg" className="deck__card deck__card--2" />
              <span className="deck__count">{table.deckCount}</span>
            </div>

            <div className={`discard${fx?.type === 'play' ? ' is-hit' : ''}`}>
              <CardView card={table.topCard} size="lg" className="discard__card" />
              <span className="discard__label">Défausse · {table.discardCount}</span>
            </div>

            {pending > 0 ? (
              <div className={`penalty-badge${fx?.type === 'penalty' ? ' is-bump' : ''}`} key={pending}>
                <span className="penalty-badge__num">+{pending}</span>
                <span className="penalty-badge__label">
                  à piocher · répondre avec ≥ +{table.pendingLastValue}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {/* journal */}
        <div className="log">
          {(state.log || []).slice(-5).map((l) => (
            <p key={l.id} className={`log__line log__line--${l.type}`}>
              {l.text}
            </p>
          ))}
        </div>
      </div>

      {/* barre de temps du tour */}
      {state.status === PHASE.PLAYING && isMyTurn ? (
        <div className="turnbar" title="Temps restant pour jouer">
          <div className="turnbar__fill" style={{ width: `${turnRatio * 100}%` }} />
        </div>
      ) : null}

      {/* main + actions */}
      <footer className="handbar">
        <div className="handbar__actions">
          {isMyTurn ? (
            <>
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={submit}
                disabled={!verdict?.ok}
                title={verdict?.ok ? verdict.label : verdict?.reason || 'Sélectionnez des cartes'}
              >
                ▶ Jouer
              </button>
              {pending > 0 ? (
                <button type="button" className="btn btn--warn btn--lg" onClick={actions.draw}>
                  🃏 Prendre +{pending}
                </button>
              ) : (
                <button type="button" className="btn btn--ghost btn--lg" onClick={actions.draw}>
                  🃏 Piocher
                </button>
              )}
              {pending === 0 && playableIds.size === 0 ? (
                <button type="button" className="btn btn--ghost btn--lg" onClick={actions.pass}>
                  ⏭ Passer
                </button>
              ) : null}
            </>
          ) : (
            <p className="handbar__waiting">
              Au tour de <strong>{state.players.find((p) => p.id === table.currentPlayerId)?.name || '—'}</strong>…
            </p>
          )}
          {unoAvailable ? (
            <button type="button" className="btn btn--uno btn--lg" onClick={actions.uno}>
              🔊 UNO !
            </button>
          ) : null}
        </div>

        <div className="handbar__hint">
          {selectedCards.length ? (
            verdict?.ok ? (
              <span className="hint hint--ok">
                {selectedCards.length} carte{selectedCards.length > 1 ? 's' : ''} → {verdict.label}
                {verdict.penalty > 0 ? ` (+${verdict.penalty})` : ''}
              </span>
            ) : (
              <span className="hint hint--ko">❌ {verdict?.reason || 'Cette combinaison n’est pas autorisée.'}</span>
            )
          ) : (
            <span className="hint">
              {pending > 0
                ? `Pénalité en cours : +${pending}. Répondez avec une carte ≥ +${table.pendingLastValue} ou prenez ${pending} cartes.`
                : `${playableIds.size} carte(s) jouable(s) dans votre main.`}
            </span>
          )}
        </div>

        <div className="hand" ref={handRef}>
          {(me?.hand || []).map((card) => (
            <div key={card.id} className="hand__slot">
              <CardView
                card={card}
                size="md"
                selected={selected.includes(card.id)}
                playable={isMyTurn && playableIds.has(card.id)}
                dimmed={isMyTurn && !playableIds.has(card.id) && !selected.includes(card.id)}
                onClick={isMyTurn ? () => toggle(card) : undefined}
                title={describeCard(card)}
                className="hand__card"
              />
            </div>
          ))}
          {!me?.hand?.length ? <p className="muted">Ta main est vide…</p> : null}
        </div>
      </footer>

      {colorModal ? (
        <ColorPicker
          colors={colorModal.colors}
          onPick={doPlay}
          onCancel={() => setColorModal(null)}
          title="Quelle couleur pour la suite ?"
        />
      ) : null}

      {state.status === PHASE.FINISHED ? (
        <GameOver
          state={state}
          isHost={!!me?.isHost}
          onReplay={actions.replay}
          onQuit={actions.leave}
          onBackToLobby={() => {}}
        />
      ) : null}
    </div>
  );
}
