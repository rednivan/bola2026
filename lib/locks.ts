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

// KO predictions normally require the group stage to have ended (Window 2) and
// lock again once the KO stage starts. An admin can grant a one-off exception by
// setting koUnlockUntil to a future timestamp on a specific prediction, which
// overrides the per-prediction flag and both tournament-wide dates until it expires.
export function isKOLocked(
  prediction: { koLocked: boolean; koUnlockUntil: Date | null },
  tournament: { groupStageEnd: Date; knockoutStageStart: Date },
): boolean {
  const now = new Date()
  if (prediction.koUnlockUntil && now < prediction.koUnlockUntil) return false
  return prediction.koLocked || now < tournament.groupStageEnd || now >= tournament.knockoutStageStart
}
