/** Shown when a player taps a slot somebody else already took. */
const TAKEN_MESSAGES = [
  'TOO SLOW.\nIf you wanted this spot, you should have been better at Draft Dash.',
  "DON'T HATE THE PLAYER.\nHATE THE GAME.",
  'SHOULD HAVE RUN FARTHER.',
  'SKILL ISSUE.',
  'YOU HAD ONE JOB.\nDODGE DEFENDERS.',
  "INTERESTING CHOICE.\nUnfortunately, it is not your choice.",
  'THAT ONE IS SPOKEN FOR.\nYards talk.',
  'BOLD OF YOU TO ASSUME\nTHAT WAS STILL AVAILABLE.',
];

export function randomTakenMessage(): string {
  return TAKEN_MESSAGES[Math.floor(Math.random() * TAKEN_MESSAGES.length)];
}
