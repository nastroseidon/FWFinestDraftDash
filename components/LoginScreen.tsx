'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { sfx } from '@/game/audio';

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError('');
    try {
      sfx.unlock();
      await api.login(name, pin);
      sfx.confirm();
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <form className="panel" onSubmit={submit}>
        <p className="brand">FORT WAYNE FINEST</p>
        <h1 className="title">
          DRAFT
          <br />
          DASH
        </h1>

        <label className="fieldLabel" htmlFor="name">
          MANAGER
        </label>
        <input
          id="name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          autoCapitalize="words"
          spellCheck={false}
          required
        />

        <label className="fieldLabel" htmlFor="pin">
          PIN
        </label>
        <input
          id="pin"
          className="field"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
        />

        {error ? <p className="error">{error}</p> : null}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'CHECKING...' : 'ENTER'}
        </button>
        <p className="tutorial">ONE MANAGER. ONE PIN. NO SHARING.</p>
      </form>
    </main>
  );
}
