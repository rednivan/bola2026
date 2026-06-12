// Group predictions normally lock once the tournament's group stage starts.
// An admin can grant a one-off exception by setting groupUnlockUntil to a
// future timestamp on a specific prediction, which overrides both the
// per-prediction flag and the tournament-wide start date until it expires.
export function isGroupLocked(
  prediction: { groupLocked: boolean; groupUnlockUntil: Date | null },
  tournament: { groupStageStart: Date },
): boolean {
  const now = new Date()
  if (prediction.groupUnlockUntil && now < prediction.groupUnlockUntil) return false
  return prediction.groupLocked || now >= tournament.groupStageStart
}
