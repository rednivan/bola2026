"use client"

import { CheckCircle2, XCircle, Clock, Trophy, Star } from "lucide-react"
import { LocalDate } from "@/components/local-date"
import type { KOMatch } from "./ko-bracket-editor"
import type { Team } from "./prediction-editor"

const STAGE_META: Record<string, { label: string }> = {
  R32:         { label: "Round of 32" },
  R16:         { label: "Round of 16" },
  QF:          { label: "Quarter-finals" },
  SF:          { label: "Semi-finals" },
  THIRD_PLACE: { label: "Third Place" },
  FINAL:       { label: "Final" },
}

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"]

type SavedKOPick = {
  predictedWinnerId: string | null
  pointsEarned: number
}

type Props = {
  koMatches: KOMatch[]
  savedKOPicksMap: Record<string, SavedKOPick>
  jokerMatchIds?: Record<string, string>
  resolvedTeams: Record<string, { home: Team | null; away: Team | null }>
  resolvedCascadeTeams?: Record<string, { home: Team | null; away: Team | null }>
}

function resolveTeam(match: KOMatch, resolved: { home: Team | null; away: Team | null } | undefined, side: "home" | "away"): Team | null {
  return side === "home"
    ? (match.homeTeam ?? resolved?.home ?? null)
    : (match.awayTeam ?? resolved?.away ?? null)
}

export function KOResultsView({ koMatches, savedKOPicksMap, jokerMatchIds = {}, resolvedTeams, resolvedCascadeTeams }: Props) {
  const matchesByStage = STAGE_ORDER.reduce<Record<string, KOMatch[]>>((acc, stage) => {
    acc[stage] = koMatches.filter((m) => m.stage === stage).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    return acc
  }, {})

  const playedMatches = koMatches.filter((m) => m.homeScore !== null && m.homeScore !== undefined)
  const totalKOPoints = playedMatches.reduce((sum, m) => sum + (savedKOPicksMap[m.id]?.pointsEarned ?? 0), 0)
  const correctPicks = playedMatches.filter((m) => {
    const pick = savedKOPicksMap[m.id]
    return pick && pick.pointsEarned > 0
  })

  return (
    <div className="space-y-8">
      {/* Summary header */}
      <div className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#E61D25]/20 flex items-center justify-center">
            <Trophy className="w-4 h-4 text-[#E61D25]" />
          </div>
          <div>
            <p className="text-white font-bold text-base">KO Bracket Results</p>
            <p className="text-[#D1D4D1]/60 text-sm">Your Window 2 predictions vs actual results</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[#E61D25] font-bold text-2xl tabular-nums">{totalKOPoints}</p>
            <p className="text-[#D1D4D1]/60 text-xs">KO points</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#1E2B6E]">
          <div className="text-center">
            <p className="text-white font-bold text-lg tabular-nums">{playedMatches.length}</p>
            <p className="text-[#D1D4D1]/60 text-xs">Played</p>
          </div>
          <div className="text-center">
            <p className="text-[#3CAC3B] font-bold text-lg tabular-nums">{correctPicks.length}</p>
            <p className="text-[#D1D4D1]/60 text-xs">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-lg tabular-nums">
              {playedMatches.length > 0 ? Math.round((correctPicks.length / playedMatches.length) * 100) : 0}%
            </p>
            <p className="text-[#D1D4D1]/60 text-xs">Accuracy</p>
          </div>
        </div>
      </div>

      {/* Per-stage breakdown */}
      {STAGE_ORDER.map((stage) => {
        const matches = matchesByStage[stage]
        if (!matches || matches.length === 0) return null

        const meta = STAGE_META[stage]
        const stageJoker = jokerMatchIds[stage]
        const stagePts = matches.filter(m => m.homeScore !== null && m.homeScore !== undefined).reduce((sum, m) => sum + (savedKOPicksMap[m.id]?.pointsEarned ?? 0), 0)

        return (
          <div key={stage} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stage === "FINAL" && <Trophy className="w-4 h-4 text-yellow-400" />}
                <h3 className="text-white font-semibold text-sm">{meta.label}</h3>
              </div>
              <span className={`text-sm font-bold tabular-nums ${stagePts > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                +{stagePts} pts
              </span>
            </div>

            <div className={
              stage === "R32" || stage === "R16" ? "ko-grid-wide" :
              stage === "QF" || stage === "SF" ? "ko-grid-medium" :
              "ko-grid-single"
            }>
              {matches.map((match) => {
                const resolved = resolvedTeams[match.id]
                const cascade = resolvedCascadeTeams?.[match.id]
                const homeTeam = resolveTeam(match, resolved, "home")
                const awayTeam = resolveTeam(match, resolved, "away")
                // Cascade home/away: what the user predicted would be in each slot
                const cascadeHome = cascade?.home ?? null
                const cascadeAway = cascade?.away ?? null
                const homeEliminated = !!cascadeHome && !!match.homeTeam && match.homeTeam.id !== cascadeHome.id
                const awayEliminated = !!cascadeAway && !!match.awayTeam && match.awayTeam.id !== cascadeAway.id
                const pick = savedKOPicksMap[match.id]
                const hasResult = match.homeScore !== null && match.homeScore !== undefined
                const isJoker = stageJoker === match.id || stage === "THIRD_PLACE"

                // Determine predicted team — check cascade bracket first so eliminated teams resolve
                let predictedTeam: Team | null = null
                if (pick?.predictedWinnerId) {
                  if (pick.predictedWinnerId === homeTeam?.id) predictedTeam = homeTeam
                  else if (pick.predictedWinnerId === awayTeam?.id) predictedTeam = awayTeam
                  else if (pick.predictedWinnerId === cascadeHome?.id) predictedTeam = cascadeHome
                  else if (pick.predictedWinnerId === cascadeAway?.id) predictedTeam = cascadeAway
                }

                // Determine actual winner team
                let actualWinnerTeam: Team | null = null
                if (hasResult && match.winnerId) {
                  if (match.winnerId === homeTeam?.id) actualWinnerTeam = homeTeam
                  else if (match.winnerId === awayTeam?.id) actualWinnerTeam = awayTeam
                }

                const isCorrect = hasResult && pick && pick.predictedWinnerId !== null && pick.predictedWinnerId === match.winnerId
                const isWrong = hasResult && pick && pick.predictedWinnerId !== null && pick.predictedWinnerId !== match.winnerId
                const noPick = !pick || pick.predictedWinnerId === null

                return (
                  <div key={match.id} className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-4 space-y-3">
                    {/* Match header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[#474A4A] text-xs font-mono">#{match.matchNumber}</span>
                        <span className="text-[#474A4A] text-xs"><LocalDate date={match.kickoff} fmt="d MMM" /></span>
                        {isJoker && (
                          <span className="flex items-center gap-1 text-[10px] bg-amber-700/40 text-amber-300 border border-amber-600/40 rounded px-1.5 py-0.5 font-medium">
                            <Star className="w-2.5 h-2.5 fill-amber-400" /> JOKER ×2
                          </span>
                        )}
                      </div>
                      <span className="text-[#474A4A] text-xs">+{match.pointsAvailable}pts base</span>
                    </div>

                    {/* Teams + score */}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {(cascadeHome ?? homeTeam)?.flagUrl && (
                            <img src={(cascadeHome ?? homeTeam)!.flagUrl} alt={(cascadeHome ?? homeTeam)!.code} className={`w-7 h-5 object-cover rounded-sm shrink-0 ${homeEliminated ? "opacity-50" : ""}`} />
                          )}
                          <span className={`text-sm font-medium truncate ${homeEliminated ? "text-[#474A4A]" : "text-white"}`}>{(cascadeHome ?? homeTeam)?.name ?? match.homeTeamPlaceholder ?? "TBD"}</span>
                        </div>
                        {homeEliminated && <span className="text-[#E61D25] text-[9px] font-medium uppercase tracking-wide">eliminated</span>}
                      </div>

                      <div className="shrink-0 text-center min-w-[60px]">
                        {hasResult ? (
                          <span className="text-white font-bold tabular-nums text-base">
                            {match.homeScore} – {match.awayScore}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 text-[#474A4A]">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-xs">Pending</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 flex-1 min-w-0 items-end">
                        <div className="flex items-center gap-2 min-w-0 justify-end">
                          <span className={`text-sm font-medium truncate ${awayEliminated ? "text-[#474A4A]" : "text-white"}`}>{(cascadeAway ?? awayTeam)?.name ?? match.awayTeamPlaceholder ?? "TBD"}</span>
                          {(cascadeAway ?? awayTeam)?.flagUrl && (
                            <img src={(cascadeAway ?? awayTeam)!.flagUrl} alt={(cascadeAway ?? awayTeam)!.code} className={`w-7 h-5 object-cover rounded-sm shrink-0 ${awayEliminated ? "opacity-50" : ""}`} />
                          )}
                        </div>
                        {awayEliminated && <span className="text-[#E61D25] text-[9px] font-medium uppercase tracking-wide">eliminated</span>}
                      </div>
                    </div>

                    {/* Prediction result */}
                    <div className={`flex items-center justify-between pt-3 border-t ${
                      isCorrect ? "border-[#3CAC3B]/30" : isWrong ? "border-[#E61D25]/30" : "border-[#1E2B6E]"
                    }`}>
                      <div className="flex items-center gap-2">
                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] shrink-0" />}
                        {isWrong && <XCircle className="w-4 h-4 text-[#E61D25] shrink-0" />}
                        {!isCorrect && !isWrong && <div className="w-4 h-4 rounded-full border border-[#474A4A] shrink-0" />}
                        <span className={`text-sm ${
                          isCorrect ? "text-[#3CAC3B]" :
                          isWrong ? "text-[#E61D25]" :
                          "text-[#474A4A]"
                        }`}>
                          {noPick
                            ? "No pick made"
                            : `Picked: ${predictedTeam?.name ?? "Unknown"}`
                          }
                          {hasResult && !noPick && actualWinnerTeam && (
                            <span className="text-[#D1D4D1]/40 ml-1 text-xs">
                              (won: {actualWinnerTeam.name})
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        {hasResult ? (
                          <span className={`font-bold tabular-nums text-sm ${
                            (pick?.pointsEarned ?? 0) > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"
                          }`}>
                            +{pick?.pointsEarned ?? 0} pts
                            {isJoker && (pick?.pointsEarned ?? 0) > 0 && (
                              <span className="text-amber-400 ml-1 text-xs">(×2)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#474A4A] text-xs">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
