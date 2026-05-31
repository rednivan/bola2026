"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Save, CheckCircle2, AlertCircle, Trophy, Shield, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveKOPredictions, saveJokerPick } from "@/lib/actions/predictions"
import type { Team } from "./prediction-editor"

export type KOMatch = {
  id: string
  stage: string
  matchNumber: number
  kickoff: Date
  pointsAvailable: number
  homeTeam: Team | null
  awayTeam: Team | null
  homeTeamPlaceholder: string | null
  awayTeamPlaceholder: string | null
  homeScore?: number | null
  awayScore?: number | null
  winnerId?: string | null
}

export type KOPick = "home" | "away" | null

const STAGE_META: Record<string, { label: string }> = {
  R32:         { label: "Round of 32" },
  R16:         { label: "Round of 16" },
  QF:          { label: "Quarter-finals" },
  SF:          { label: "Semi-finals" },
  THIRD_PLACE: { label: "Third Place" },
  FINAL:       { label: "Final" },
}

const STAGE_ORDER = ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"]

type Props = {
  predictionId: string
  koMatches: KOMatch[]
  picks: Record<string, KOPick>                                       // controlled by parent
  onPickChange: (matchId: string, pick: KOPick) => void
  onSaveSuccess?: (savedCount: number) => void
  // derived team overrides: when DB teams are null, use these bracket-derived teams
  resolvedTeams: Record<string, { home: Team | null; away: Team | null }>
  locked: boolean
  // stage → matchId joker picks
  jokerMatchIds?: Record<string, string>
}

function TeamSlot({ team, placeholder }: { team: Team | null; placeholder: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {team?.flagUrl ? (
        <img src={team.flagUrl} alt={team.code} className="w-8 h-6 object-cover rounded-sm" />
      ) : (
        <div className="w-8 h-6 bg-[#1E2B6E] rounded-sm flex items-center justify-center">
          <Shield className="w-3.5 h-3.5 text-[#474A4A]" />
        </div>
      )}
      <span className={`text-xs font-bold text-center leading-tight ${team ? "text-white" : "text-[#474A4A] italic"}`}>
        {team ? team.code : (placeholder ?? "TBD")}
      </span>
    </div>
  )
}

function KOMatchCard({ match, pick, resolvedHome, resolvedAway, onPick, locked }: {
  match: KOMatch
  pick: KOPick
  resolvedHome: Team | null
  resolvedAway: Team | null
  onPick: (p: KOPick) => void
  locked: boolean
}) {
  const displayHome = match.homeTeam ?? resolvedHome
  const displayAway = match.awayTeam ?? resolvedAway

  function handlePick(side: "home" | "away") {
    if (locked) return
    onPick(pick === side ? null : side)
  }

  const base = "flex-1 flex flex-col items-center gap-2 py-3 px-2 rounded-lg border transition-all"
  const active = "bg-[#E61D25]/15 border-[#E61D25] shadow-sm shadow-[#E61D25]/20"
  const idle = "bg-[#131D42] border-[#1E2B6E] hover:border-[#2A398D]/80 hover:bg-[#1A2560]/50"

  return (
    <div className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[#474A4A] text-xs font-mono">#{match.matchNumber}</span>
        <div className="flex items-center gap-2">
          <span className="text-[#3CAC3B] text-xs font-semibold">+{match.pointsAvailable}pts</span>
          <span className="text-[#474A4A] text-xs">{format(match.kickoff, "d MMM")}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => handlePick("home")}
          disabled={locked}
          className={`${base} ${pick === "home" ? active : idle} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <TeamSlot
            team={displayHome}
            placeholder={match.homeTeamPlaceholder}
          />
        </button>

        <div className="flex items-center justify-center text-[#474A4A] text-xs font-bold shrink-0">vs</div>

        <button
          onClick={() => handlePick("away")}
          disabled={locked}
          className={`${base} ${pick === "away" ? active : idle} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <TeamSlot
            team={displayAway}
            placeholder={match.awayTeamPlaceholder}
          />
        </button>
      </div>

      {pick && (
        <p className="text-center text-[#E61D25] text-xs font-medium truncate">
          {(pick === "home" ? (displayHome?.name ?? match.homeTeamPlaceholder) : (displayAway?.name ?? match.awayTeamPlaceholder)) ?? "TBD"} to win
        </p>
      )}
    </div>
  )
}

export function KOBracketEditor({ predictionId, koMatches, picks, onPickChange, onSaveSuccess, resolvedTeams, locked, jokerMatchIds = {} }: Props) {
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const thirdPlaceMatch = koMatches.find(m => m.stage === "THIRD_PLACE")

  // Pre-assign 3rd place joker — only one match so it's always set
  const [jokers, setJokers] = useState<Record<string, string>>(() =>
    thirdPlaceMatch ? { THIRD_PLACE: thirdPlaceMatch.id, ...jokerMatchIds } : jokerMatchIds
  )

  // Auto-save 3rd place joker to DB if not already stored
  useEffect(() => {
    if (thirdPlaceMatch && !jokerMatchIds["THIRD_PLACE"] && !locked) {
      saveJokerPick(predictionId, "THIRD_PLACE", thirdPlaceMatch.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleJokerToggle(stage: string, matchId: string) {
    if (locked) return
    const newMatchId = jokers[stage] === matchId ? undefined : matchId
    setJokers((j) => {
      const next = { ...j }
      if (newMatchId === undefined) delete next[stage]
      else next[stage] = newMatchId
      return next
    })
    saveJokerPick(predictionId, stage, newMatchId ?? null)
  }

  const matchesByStage = STAGE_ORDER.reduce<Record<string, KOMatch[]>>((acc, stage) => {
    acc[stage] = koMatches.filter((m) => m.stage === stage).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
    return acc
  }, {})

  const totalKO = koMatches.length
  const filledKO = Object.values(picks).filter(Boolean).length

  function handleSave() {
    const payload = koMatches
      .filter((m) => picks[m.id])
      .map((m) => {
        const pick = picks[m.id]
        const resolved = resolvedTeams[m.id]
        const homeTeam = m.homeTeam ?? resolved?.home ?? null
        const awayTeam = m.awayTeam ?? resolved?.away ?? null
        return {
          matchId: m.id,
          predictedWinnerId:
            pick === "home" ? (homeTeam?.id ?? null) :
            pick === "away" ? (awayTeam?.id ?? null) :
            null,
          isDraw: false,
        }
      })

    setStatus("saved")
    onSaveSuccess?.(payload.length)
    saveKOPredictions(predictionId, payload).then(result => {
      if (!result.ok) { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-white font-bold text-lg">Knockout Bracket</h2>
            {locked && (
              <span className="text-xs text-[#474A4A] border border-[#1E2B6E] rounded-full px-2 py-0.5">
                Opens after the group stage ends
              </span>
            )}
          </div>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Teams auto-populate from your group predictions. No draws — pick the winner of each match.
            Tap <Star className="inline w-3.5 h-3.5 text-amber-400 fill-amber-400 mx-0.5 -mt-0.5" /> to set a joker for each round (R32 through SF) — doubles points if correct. The 3rd place match joker is pre-assigned.
          </p>
        </div>

        {!locked && (
          <div className="flex items-center gap-3 shrink-0">
            {status === "saved" && (
              <span className="flex items-center gap-1.5 text-[#3CAC3B] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            {status === "error" && (
              <span className="flex items-center gap-1.5 text-[#E61D25] text-sm">
                <AlertCircle className="w-4 h-4" /> {errorMsg}
              </span>
            )}
            <Button onClick={handleSave} className="bg-[#E61D25] hover:bg-[#CC1920] text-white">
              <Save className="w-4 h-4 mr-2" /> Save bracket
            </Button>
          </div>
        )}
        {locked && <Badge className="bg-[#131D42] border border-[#1E2B6E] text-[#D1D4D1]">Locked</Badge>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#1E2B6E] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E61D25] rounded-full transition-all duration-300"
            style={{ width: totalKO > 0 ? `${Math.round((filledKO / totalKO) * 100)}%` : "0%" }}
          />
        </div>
        <span className={`text-sm shrink-0 ${filledKO === totalKO ? "text-[#3CAC3B]" : "text-[#D1D4D1]/60"}`}>
          {filledKO}/{totalKO}
        </span>
      </div>

      {STAGE_ORDER.map((stage) => {
        const matches = matchesByStage[stage]
        if (!matches || matches.length === 0) return null
        const meta = STAGE_META[stage]
        const stageFilled = matches.filter((m) => picks[m.id]).length
        const isFinal = stage === "FINAL"
        const stageJoker = jokers[stage]

        return (
          <div key={stage} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isFinal && <Trophy className="w-4 h-4 text-yellow-400" />}
                <h3 className="text-white font-semibold text-sm">{meta.label}</h3>
                <span className="text-[#3CAC3B] text-xs font-semibold">
                  +{matches[0].pointsAvailable}pts each
                </span>
              </div>
              <div className="flex items-center gap-3">
                {stageJoker && (
                  <span className="flex items-center gap-1 text-amber-400/80 text-xs">
                    <Star className="w-3 h-3 fill-amber-400" /> Joker set
                  </span>
                )}
                <span className={`text-xs tabular-nums ${stageFilled === matches.length ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                  {stageFilled}/{matches.length}
                </span>
              </div>
            </div>

            <div className={
              stage === "R32" || stage === "R16" ? "ko-grid-wide" :
              stage === "QF" || stage === "SF" || stage === "THIRD_PLACE" ? "ko-grid-medium" :
              "ko-grid-single"
            }>
              {matches.map((match) => {
                const resolved = resolvedTeams[match.id] ?? { home: null, away: null }
                const isJoker = stageJoker === match.id
                return (
                  <div key={match.id} className="relative">
                    <KOMatchCard
                      match={match}
                      pick={picks[match.id] ?? null}
                      resolvedHome={resolved.home}
                      resolvedAway={resolved.away}
                      onPick={(p) => { onPickChange(match.id, p); setStatus("idle") }}
                      locked={locked}
                    />
                    {!locked && stage !== "FINAL" && stage !== "THIRD_PLACE" && (
                      <button
                        type="button"
                        onClick={() => handleJokerToggle(stage, match.id)}
                        title={isJoker ? "Remove joker" : "Set as joker (doubles points if correct)"}
                        className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded border transition-all ${
                          isJoker
                            ? "bg-amber-600/30 border-amber-500/60 text-amber-400"
                            : "bg-[#0D1333] border-[#1E2B6E] text-slate-400 hover:border-amber-500/60 hover:text-amber-400"
                        }`}
                      >
                        <Star className={`w-3 h-3 ${isJoker ? "fill-amber-400" : ""}`} />
                      </button>
                    )}
                    {(isJoker || stage === "THIRD_PLACE") && (
                      <div className="absolute top-2 left-2">
                        <span className="text-[10px] bg-amber-700/40 text-amber-300 border border-amber-600/40 rounded px-1.5 py-0.5 font-medium">
                          JOKER ×2
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <p className="text-[#474A4A] text-xs">
        R32 teams are derived from your group stage predictions using an assumed bracket structure. Actual pairings are confirmed after the draw.
      </p>
    </div>
  )
}
