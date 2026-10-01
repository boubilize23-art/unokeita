import React from 'react';
import { COLORS } from '@uno-star/shared/constants';

const LABEL = { red: 'Rouge', yellow: 'Jaune', green: 'Vert', blue: 'Bleu' };

export default function ColorPicker({ colors = COLORS, onPick, onCancel, title = 'Choisir la couleur' }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal modal--colors">
        <h3 className="modal__title">{title}</h3>
        <div className="color-grid">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-dot color-dot--${c}`}
              onClick={() => onPick(c)}
              aria-label={LABEL[c] || c}
            >
              <span>{LABEL[c] || c}</span>
            </button>
          ))}
        </div>
        {onCancel ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Annuler
          </button>
        ) : null}
      </div>
    </div>
  );
}