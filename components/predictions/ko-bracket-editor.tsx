"use client"

import { useTransition, useState } from "react"
import { format } from "date-fns"
import { Save, CheckCircle2, AlertCircle, Loader2, Trophy, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveKOPredictions } from "@/lib/actions/predictions"
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
}

export type KOPick = "home" | "away" | null

const STAGE_META: Record<string, { label: string; cols: string }> = {
  R32:         { label: "Round of 32",    cols: "lg:grid-cols-2 xl:grid-cols-4" },
  R16:         { label: "Round of 16",    cols: "lg:grid-cols-2 xl:grid-cols-4" },
  QF:          { label: "Quarter-finals", cols: "lg:grid-cols-2 xl:grid-cols-2" },
  SF:          { label: "Semi-finals",    cols: "lg:grid-cols-2" },
  THIRD_PLACE: { label: "Third Place",    cols: "lg:grid-cols-2" },
  FINAL:       { label: "Final",          cols: "" },
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

export function KOBracketEditor({ predictionId, koMatches, picks, onPickChange, onSaveSuccess, resolvedTeams, locked }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

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

    startTransition(async () => {
      const result = await saveKOPredictions(predictionId, payload)
      if (result.ok) { setStatus("saved"); onSaveSuccess?.(payload.length) }
      else { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-lg">Knockout Bracket</h2>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Teams auto-populate from your group predictions. No draws — pick the winner of each match.
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
            <Button onClick={handleSave} disabled={isPending} className="bg-[#E61D25] hover:bg-[#CC1920] text-white">
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                : <><Save className="w-4 h-4 mr-2" /> Save bracket</>
              }
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
              <span className={`text-xs tabular-nums ${stageFilled === matches.length ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                {stageFilled}/{matches.length}
              </span>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${meta.cols}`}>
              {matches.map((match) => {
                const resolved = resolvedTeams[match.id] ?? { home: null, away: null }
                return (
                  <KOMatchCard
                    key={match.id}
                    match={match}
                    pick={picks[match.id] ?? null}
                    resolvedHome={resolved.home}
                    resolvedAway={resolved.away}
                    onPick={(p) => { onPickChange(match.id, p); setStatus("idle") }}
                    locked={locked}
                  />
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
