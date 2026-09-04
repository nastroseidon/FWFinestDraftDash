'use client';

import { useState } from 'react';

type Props = {
  onBegin: () => Promise<void>;
  onCancel: () => void;
};

/** The point of no return. Deliberately blunt. */
export default function OfficialWarning({ onBegin, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <main className="app">
      <div className="panel">
        <h1 className="headline">OFFICIAL DRAFT RUN</h1>
        <p className="warnBody">
          YOU HAVE <strong>ONE ATTEMPT</strong>.
        </p>
        <p className="warnBody">
          Your score determines when you get to choose your Fort Wayne Finest draft position.
        </p>
        <p className="warnBody">Once you begin, your run cannot be restarted.</p>
        <p className="warnBody muted">Wi-Fi excuses will be mocked.</p>

        {error ? <p className="error">{error}</p> : null}

        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onBegin();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not start the run.');
              setBusy(false);
            }
          }}
        >
          {busy ? 'STARTING...' : 'BEGIN OFFICIAL RUN'}
        </button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>
          NOT YET
        </button>
      </div>
    </main>
  );
}
