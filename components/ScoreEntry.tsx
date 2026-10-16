'use client';

import { useState } from 'react';

type Props = {
  yards: number;
  onSubmit: (initials: string) => Promise<void>;
  onSkip: () => void;
};

/** Anything the board can store: letters, digits, spaces and periods. */
const ALLOWED = /[^A-Z0-9 .]/g;

export default function ScoreEntry({ yards, onSubmit, onSkip }: Props) {
  const [initials, setInitials] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = initials.trim().length > 0;

  return (
    <main className="app">
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !ready) return;
          setBusy(true);
          setError('');
          try {
            await onSubmit(initials);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save your score.');
            setBusy(false);
          }
        }}
      >
        <h1 className="headline">TOP 20!</h1>
        <p className="label">YOUR DISTANCE</p>
        <p className="bigScore">{yards.toLocaleString('en-US')}</p>
        <p className="unit">YARDS</p>

        <label className="fieldLabel" htmlFor="initials">
          ENTER YOUR INITIALS
        </label>
        <input
          id="initials"
          className="field initialsField"
          value={initials}
          onChange={(e) => setInitials(e.target.value.toUpperCase().replace(ALLOWED, '').slice(0, 3))}
          maxLength={3}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="AAA"
          autoFocus
        />
        <p className="meta muted">3 CHARACTERS. LETTERS, NUMBERS, SPACES OR PERIODS.</p>

        {error ? <p className="error">{error}</p> : null}

        <button className="btn" type="submit" disabled={busy || !ready}>
          {busy ? 'SAVING...' : 'SAVE SCORE'}
        </button>
        <button className="btn secondary" type="button" disabled={busy} onClick={onSkip}>
          SKIP
        </button>
      </form>
    </main>
  );
}
