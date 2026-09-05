'use client';

import { useEffect, useState } from 'react';

type Props = {
  onBegin: () => Promise<void>;
  onCancel: () => void;
};

const QUESTIONS = ['ARE YOU SURE?', 'POSITIVE?', 'LIKE, 100%, HIV +?!'];

/** The point of no return. Deliberately blunt. */
export default function OfficialWarning({ onBegin, onCancel }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // How many confirmation popups are on screen. 0 = none yet.
  const [shown, setShown] = useState(0);
  const [sendOff, setSendOff] = useState(false);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      await onBegin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the run.');
      setBusy(false);
      setSendOff(false);
      setShown(0);
    }
  };

  // The last popup is a send-off, not a question: it reads, then the run begins.
  useEffect(() => {
    if (!sendOff) return;
    const id = setTimeout(() => void start(), 2200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendOff]);

  const answerYes = () => {
    if (shown < QUESTIONS.length) setShown(shown + 1);
    else setSendOff(true);
  };

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

        <button className="btn danger" disabled={busy} onClick={() => setShown(1)}>
          {busy ? 'STARTING...' : 'BEGIN OFFICIAL RUN'}
        </button>
        <button className="btn secondary" disabled={busy} onClick={onCancel}>
          NOT YET
        </button>
      </div>

      {/* Each YES stacks another popup on top of the last one. */}
      {QUESTIONS.map((question, i) => {
        if (shown < i + 1) return null;
        const isTop = !sendOff && shown === i + 1;
        return (
          <div key={question} className="confirmOverlay" style={{ zIndex: 60 + i * 2 }}>
            <div className="confirmBox" style={{ marginTop: i * 18, marginLeft: i * 12 }}>
              <p className="confirmText">{question}</p>
              <button className="btn danger" disabled={!isTop} onClick={answerYes}>
                YES
              </button>
              <button className="btn secondary" disabled={!isTop} onClick={onCancel}>
                NO
              </button>
            </div>
          </div>
        );
      })}

      {sendOff ? (
        <div className="confirmOverlay" style={{ zIndex: 70 }}>
          <div className="confirmBox">
            <p className="confirmText">It&rsquo;s ok, I won&rsquo;t tell.</p>
            <p className="confirmText">Anyhow, let&rsquo;s get it on!</p>
          </div>
        </div>
      ) : null}
    </main>
  );
}
