'use client';

/** Only what the board draws; `created_at` arrives as JSON and is unused. */
export type BoardRow = { initials: string; score: number };

type Props = {
  scores: BoardRow[] | null;
  error?: string;
  /** Highlights the run just added, so a player can find themselves. */
  highlight?: { initials: string; score: number } | null;
};

/** The world's top 20, newest board state passed in by whoever fetched it. */
export default function HighScores({ scores, error, highlight }: Props) {
  if (error) return <p className="error">{error}</p>;
  if (!scores) return <p className="meta">LOADING SCORES...</p>;
  if (scores.length === 0) return <p className="meta">NO SCORES YET. BE THE FIRST.</p>;

  // Only the first matching row is marked: two players can share both initials
  // and score, and only one of them just played.
  const mineIndex = highlight
    ? scores.findIndex((r) => r.initials === highlight.initials && r.score === highlight.score)
    : -1;

  return (
    <ol className="board">
      {scores.map((row, i) => {
        const isMine = i === mineIndex;

        return (
          <li className={isMine ? 'boardRow mine' : 'boardRow'} key={`${row.initials}-${i}`}>
            <span className="boardRank">{String(i + 1).padStart(2, '0')}</span>
            <span className="boardName">{row.initials}</span>
            <span className="boardScore">{row.score.toLocaleString('en-US')}</span>
          </li>
        );
      })}
    </ol>
  );
}
