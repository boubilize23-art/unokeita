import React from 'react';
import { avatarById } from '@uno-star/shared/room';

/**
 * Avatars 100% originaux dessines en SVG (aucune image externe,
 * aucune marque existante). Chaque forme est un simple assemblage de primitives.
 */

const SHAPES = {
  fox: (a, b) => (
    <>
      <path d="M14 16 L26 8 L28 22 Z" fill={a} />
      <path d="M74 16 L62 8 L60 22 Z" fill={a} />
      <circle cx="40" cy="46" r="28" fill={a} />
      <path d="M40 46 L64 38 A28 28 0 0 1 64 56 Z" fill={b} opacity="0.55" />
      <circle cx="31" cy="42" r="4" fill="#12162a" />
      <circle cx="49" cy="42" r="4" fill="#12162a" />
      <path d="M36 54 q4 5 8 0" stroke="#12162a" strokeWidth="3" fill="none" strokeLinecap="round" />
    </>
  ),
  owl: (a, b) => (
    <>
      <circle cx="40" cy="46" r="28" fill={a} />
      <circle cx="29" cy="42" r="11" fill={b} />
      <circle cx="51" cy="42" r="11" fill={b} />
      <circle cx="29" cy="42" r="4.5" fill="#12162a" />
      <circle cx="51" cy="42" r="4.5" fill="#12162a" />
      <path d="M40 50 l5 6 -10 0 z" fill="#ffb703" />
      <path d="M26 20 q14 -8 28 0" stroke={a} strokeWidth="6" fill="none" strokeLinecap="round" />
    </>
  ),
  cat: (a, b) => (
    <>
      <path d="M18 20 L30 10 L30 26 Z" fill={a} />
      <path d="M62 20 L50 10 L50 26 Z" fill={a} />
      <circle cx="40" cy="48" r="26" fill={a} />
      <circle cx="31" cy="44" r="4" fill="#12162a" />
      <circle cx="49" cy="44" r="4" fill="#12162a" />
      <path d="M36 54 q4 4 8 0" stroke="#12162a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M12 48 h14 M12 55 h14 M54 48 h14 M54 55 h14" stroke={b} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  frog: (a, b) => (
    <>
      <circle cx="26" cy="30" r="13" fill={a} />
      <circle cx="54" cy="30" r="13" fill={a} />
      <circle cx="26" cy="30" r="6" fill="#12162a" />
      <circle cx="54" cy="30" r="6" fill="#12162a" />
      <ellipse cx="40" cy="52" rx="28" ry="24" fill={a} />
      <path d="M20 56 q20 14 40 0" stroke={b} strokeWidth="5" fill="none" strokeLinecap="round" />
    </>
  ),
  bee: (a, b) => (
    <>
      <ellipse cx="26" cy="34" rx="16" ry="10" fill={b} opacity="0.9" transform="rotate(-25 26 34)" />
      <ellipse cx="54" cy="34" rx="16" ry="10" fill={b} opacity="0.9" transform="rotate(25 54 34)" />
      <ellipse cx="40" cy="50" rx="24" ry="26" fill={a} />
      <path d="M18 44 h44 M20 56 h40" stroke="#12162a" strokeWidth="6" strokeLinecap="round" />
      <circle cx="30" cy="30" r="4" fill="#12162a" />
      <circle cx="50" cy="30" r="4" fill="#12162a" />
    </>
  ),
  panda: (a, b) => (
    <>
      <circle cx="22" cy="22" r="11" fill="#12162a" />
      <circle cx="58" cy="22" r="11" fill="#12162a" />
      <circle cx="40" cy="46" r="28" fill={b} />
      <ellipse cx="29" cy="42" rx="9" ry="11" fill="#12162a" transform="rotate(-15 29 42)" />
      <ellipse cx="51" cy="42" rx="9" ry="11" fill="#12162a" transform="rotate(15 51 42)" />
      <circle cx="30" cy="42" r="3" fill="#fff" />
      <circle cx="50" cy="42" r="3" fill="#fff" />
      <ellipse cx="40" cy="56" rx="7" ry="5" fill="#12162a" />
    </>
  ),
  crab: (a, b) => (
    <>
      <circle cx="18" cy="34" r="12" fill={a} />
      <circle cx="62" cy="34" r="12" fill={a} />
      <circle cx="18" cy="34" r="5" fill={b} />
      <circle cx="62" cy="34" r="5" fill={b} />
      <ellipse cx="40" cy="52" rx="26" ry="20" fill={a} />
      <circle cx="30" cy="44" r="5" fill="#fff" />
      <circle cx="50" cy="44" r="5" fill="#fff" />
      <circle cx="31" cy="45" r="2.4" fill="#12162a" />
      <circle cx="51" cy="45" r="2.4" fill="#12162a" />
      <path d="M30 62 q-4 10 2 14 M40 66 q0 10 0 12 M50 62 q4 10 -2 14" stroke={a} strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  octo: (a, b) => (
    <>
      <path d="M40 20 a26 26 0 0 1 26 26 q0 6 -3 10 h-46 q-3 -4 -3 -10 a26 26 0 0 1 26 -26 z" fill={a} />
      <circle cx="30" cy="44" r="6" fill="#fff" />
      <circle cx="50" cy="44" r="6" fill="#fff" />
      <circle cx="31" cy="45" r="2.6" fill="#12162a" />
      <circle cx="51" cy="45" r="2.6" fill="#12162a" />
      <path d="M22 58 q-6 12 2 16 M34 58 q-4 14 2 18 M46 58 q4 14 -2 18 M58 58 q6 12 -2 16" stroke={a} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M26 34 q14 -8 28 0" stroke={b} strokeWidth="3" fill="none" opacity="0.8" />
    </>
  ),
};

export default function Avatar({ id, size = 48, className = '', title }) {
  const a = avatarById(id);
  const draw = SHAPES[a.shape] || SHAPES.fox;
  return (
    <svg
      className={`avatar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label={title || a.name}
      style={{ width: size, height: size }}
    >
      <defs>
        <linearGradient id={`av-${a.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a.colors[0]} />
          <stop offset="100%" stopColor={a.colors[1]} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="80" height="80" rx="26" fill={`url(#av-${a.id})`} />
      {draw(a.colors[0], a.colors[1])}
    </svg>
  );
}
