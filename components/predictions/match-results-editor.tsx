"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Save, CheckCircle2, AlertCircle, Loader2, Star, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveMatchPredictions, saveJokerPick, getJulesPredictions, type MatchPredictionData } from "@/lib/actions/predictions"
import type { GroupMatch, ResultChoice } from "./prediction-editor"

type Props = {
  predictionId: string
  matchesByGroup: { letter: string; groupId: string; matches: GroupMatch[] }[]
  picks: Record<string, ResultChoice>         // controlled by parent
  onPickChange: (matchId: string, choice: ResultChoice, groupId: string) => void
  onSaveSuccess?: (savedCount: number) => void
  locked: boolean
  jokerMatchId: string | null
}

function MatchRow({
  match,
  choice,
  onPick,
  locked,
  isJoker,
  onJokerToggle,
}: {
  match: GroupMatch
  choice: ResultChoice
  onPick: (c: ResultChoice) => void
  locked: boolean
  isJoker: boolean
  onJokerToggle: () => void
}) {
  const base = "flex-1 py-2.5 text-xs font-bold rounded-md border transition-all min-h-[44px]"
  const active = "bg-[#E61D25] border-[#E61D25] text-white shadow-md shadow-[#E61D25]/20"
  const idleCls = "bg-[#131D42] border-[#1E2B6E] text-[#D1D4D1] hover:border-[#2A398D] hover:text-white"
  const dis = "cursor-not-allowed opacity-50"

  function pick(c: ResultChoice) {
    if (locked) return
    onPick(choice === c ? null : c)
  }

  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-2.5 border-b border-[#1E2B6E]/40 last:border-0 ${isJoker ? "bg-amber-950/20 -mx-4 px-4 rounded-lg" : ""}`}>
      {/* Home */}
      <div className="flex items-center gap-2 min-w-0">
        {match.homeTeam?.flagUrl && (
          <img src={match.homeTeam.flagUrl} alt={match.homeTeam.code} className="w-6 h-4 object-cover rounded-sm shrink-0" />
        )}
        <span className="text-white text-sm font-medium truncate">{match.homeTeam?.code ?? "TBD"}</span>
      </div>

      {/* Buttons */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => pick("home")} disabled={locked} title={`${match.homeTeam?.name} win`}
            className={`${base} px-3 ${choice === "home" ? active : idleCls} ${locked ? dis : ""}`}>1</button>
          <button onClick={() => pick("draw")} disabled={locked} title="Draw"
            className={`${base} px-3 ${choice === "draw" ? active : idleCls} ${locked ? dis : ""}`}>X</button>
          <button onClick={() => pick("away")} disabled={locked} title={`${match.awayTeam?.name} win`}
            className={`${base} px-3 ${choice === "away" ? active : idleCls} ${locked ? dis : ""}`}>2</button>
          <button
            onClick={onJokerToggle}
            disabled={locked}
            title={isJoker ? "Remove joker" : "Set as joker (doubles points if correct)"}
            className={`ml-1 w-7 h-7 flex items-center justify-center rounded-md border transition-all shrink-0 ${
              isJoker
                ? "bg-amber-600/30 border-amber-500/60 text-amber-400"
                : "bg-[#131D42] border-[#2A398D] text-slate-400 hover:border-amber-500/60 hover:text-amber-400"
            } ${locked ? dis : ""}`}
          >
            <Star className={`w-3.5 h-3.5 ${isJoker ? "fill-amber-400" : ""}`} />
          </button>
        </div>
        <span className="text-[#474A4A] text-xs">
          {format(match.kickoff, "d MMM")}
        </span>
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 min-w-0 justify-end">
        <span className="text-white text-sm font-medium truncate">{match.awayTeam?.code ?? "TBD"}</span>
        {match.awayTeam?.flagUrl && (
          <img src={match.awayTeam.flagUrl} alt={match.awayTeam.code} className="w-6 h-4 object-cover rounded-sm shrink-0" />
        )}
      </div>
    </div>
  )
}

export function MatchResultsEditor({ predictionId, matchesByGroup, picks, onPickChange, onSaveSuccess, locked, jokerMatchId }: Props) {
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [currentJoker, setCurrentJoker] = useState<string | null>(jokerMatchId)
  const [julesLoading, setJulesLoading] = useState(false)
  const [julesMsg, setJulesMsg] = useState<string | null>(null)

  function handleJokerToggle(matchId: string) {
    if (locked) return
    const newMatchId = currentJoker === matchId ? null : matchId
    setCurrentJoker(newMatchId)
    saveJokerPick(predictionId, "GROUP", newMatchId)
  }

  async function handleJules() {
    setJulesLoading(true)
    setJulesMsg(null)
    const result = await getJulesPredictions()
    if (result.ok) {
      // Build groupId lookup from matchesByGroup
      const matchGroupMap: Record<string, string> = {}
      for (const { groupId, matches } of matchesByGroup) {
        for (const m of matches) matchGroupMap[m.id] = groupId
      }
      for (const [matchId, pick] of Object.entries(result.picks)) {
        const groupId = matchGroupMap[matchId]
        if (groupId) onPickChange(matchId, pick, groupId)
      }
      setJulesMsg(result.message ?? (result.source === "odds" ? "Jules predicted using live match odds!" : null))
    }
    setJulesLoading(false)
  }

  const totalMatches = matchesByGroup.reduce((s, g) => s + g.matches.length, 0)
  const filledCount = Object.values(picks).filter(Boolean).length

  function handleSave() {
    const payload: MatchPredictionData[] = []
    for (const { matches } of matchesByGroup) {
      for (const m of matches) {
        const choice = picks[m.id]
        if (!choice) continue
        payload.push({
          matchId: m.id,
          predictedWinnerId:
            choice === "home" ? (m.homeTeam?.id ?? null) :
            choice === "away" ? (m.awayTeam?.id ?? null) :
            null,
          isDraw: choice === "draw",
        })
      }
    }

    setStatus("saved")
    onSaveSuccess?.(payload.length)
    saveMatchPredictions(predictionId, payload).then(result => {
      if (!result.ok) { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-lg">Group Match Results</h2>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Pick <span className="font-mono font-bold text-white">1</span> home win ·{" "}
            <span className="font-mono font-bold text-white">X</span> draw ·{" "}
            <span className="font-mono font-bold text-white">2</span> away win.
            Tap <Star className="inline w-3.5 h-3.5 text-amber-400 fill-amber-400 mx-0.5" /> to mark your joker — doubles points if correct.
          </p>
          {!locked && (
            <p className="text-[#D1D4D1]/70 text-xs mt-1">
              <Sparkles className="inline w-3 h-3 text-amber-400 mr-0.5" />
              Use <span className="text-amber-400 font-medium">Help me predict, Jules!</span> to pre-fill all picks from live match odds — then change any you disagree with.
            </p>
          )}
        </div>

        {!locked && (
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleJules}
                disabled={julesLoading}
                variant="outline"
                className="border-[#2A398D] bg-[#0D1333] text-[#D1D4D1] hover:bg-[#2A398D] hover:text-white text-sm"
              >
                {julesLoading
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Jules is thinking…</>
                  : <><Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-400" /> Help me predict, Jules!</>
                }
              </Button>
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
                <Save className="w-4 h-4 mr-2" /> Save results
              </Button>
            </div>
            {julesMsg && (
              <p className="text-amber-400/80 text-xs text-right">{julesMsg}</p>
            )}
          </div>
        )}
        {locked && <Badge className="bg-[#131D42] border border-[#1E2B6E] text-[#D1D4D1]">Locked</Badge>}
      </div>

      {/* Overall progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-[#1E2B6E] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#E61D25] rounded-full transition-all duration-300"
            style={{ width: `${Math.round((filledCount / totalMatches) * 100)}%` }}
          />
        </div>
        <span className={`text-sm shrink-0 ${filledCount === totalMatches ? "text-[#3CAC3B]" : "text-[#D1D4D1]/60"}`}>
          {filledCount}/{totalMatches}
        </span>
      </div>

      {/* Groups grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {matchesByGroup.map(({ letter, groupId, matches }) => {
          const groupFilled = matches.filter((m) => picks[m.id]).length
          return (
            <div key={letter} className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-[#2A398D] flex items-center justify-center text-white text-xs font-bold">
                    {letter}
                  </span>
                  Group {letter}
                </h3>
                <span className={`text-xs tabular-nums ${groupFilled === matches.length ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                  {groupFilled}/{matches.length}
                </span>
              </div>

              {matches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  choice={picks[match.id] ?? null}
                  onPick={(c) => onPickChange(match.id, c, groupId)}
                  locked={locked}
                  isJoker={currentJoker === match.id}
                  onJokerToggle={() => handleJokerToggle(match.id)}
                />
              ))}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 text-[#474A4A] text-xs flex-wrap">
        <span>Each correct group match earns 1 pt. Save separately from standings.</span>
        {currentJoker && (
          <span className="flex items-center gap-1 text-amber-400/80">
            <Star className="w-3 h-3 fill-amber-400" />
            Joker set — doubles points if correct
          </span>
        )}
      </div>
    </div>
  )
}
