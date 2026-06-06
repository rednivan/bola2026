"use client"

import { useState } from "react"
import { Save, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveGroupStandings, type GroupPredictionData } from "@/lib/actions/predictions"
import type { Team, GroupData } from "./prediction-editor"

type Props = {
  predictionId: string
  groups: GroupData[]
  groupOrders: Record<string, Team[]>
  onReorder: (groupId: string, teams: Team[]) => void
  onSaveSuccess?: () => void
  locked: boolean
}

function posColor(pos: number) {
  return pos === 1 ? "text-yellow-400" : pos === 2 ? "text-[#D1D4D1]" : pos === 3 ? "text-amber-500" : "text-[#474A4A]"
}

export function GroupStageEditor({ predictionId, groups, groupOrders, onReorder, onSaveSuccess, locked }: Props) {
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  // positions[groupId][teamId] = finishing position (1–4)
  const [positions, setPositions] = useState<Record<string, Record<string, number>>>(() => {
    const init: Record<string, Record<string, number>> = {}
    for (const group of groups) {
      const ordered = groupOrders[group.id] ?? group.teams
      init[group.id] = Object.fromEntries(ordered.map((t, i) => [t.id, i + 1]))
    }
    return init
  })

  function handlePositionChange(groupId: string, teamId: string, newPos: number) {
    if (locked) return
    const gp = positions[groupId]
    const oldPos = gp[teamId]
    // Swap with whichever team currently holds newPos
    const swapId = Object.entries(gp).find(([, p]) => p === newPos)?.[0]
    const updated: Record<string, number> = { ...gp, [teamId]: newPos }
    if (swapId && swapId !== teamId) updated[swapId] = oldPos

    setPositions((prev) => ({ ...prev, [groupId]: updated }))
    const allTeams = groupOrders[groupId] ?? groups.find((g) => g.id === groupId)!.teams
    onReorder(groupId, [...allTeams].sort((a, b) => (updated[a.id] ?? 99) - (updated[b.id] ?? 99)))
  }

  function handleSave() {
    const payload: GroupPredictionData[] = groups.map((g) => ({
      groupId: g.id,
      teams: g.teams.map((t) => ({ teamId: t.id, position: positions[g.id]?.[t.id] ?? 1 })),
    }))
    setStatus("saved")
    onSaveSuccess?.()
    saveGroupStandings(predictionId, payload).then((result) => {
      if (!result.ok) { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-lg">Group Stage Standings</h2>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Use the dropdowns to set each team's predicted finishing position. Changing one team swaps it with the other automatically.
          </p>
          <p className="text-[#D1D4D1]/70 text-xs mt-1">
            Points are awarded for each correctly predicted finishing position — so the difference between 1st and 2nd matters. The group winner also faces a different opponent in the Round of 32, which can affect your knockout points too.
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
              <Save className="w-4 h-4 mr-2" /> Save standings
            </Button>
          </div>
        )}
        {locked && <Badge className="bg-[#131D42] border border-[#1E2B6E] text-[#D1D4D1]">Locked</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {groups.map((group) => {
          const gPos = positions[group.id] ?? {}
          const teams = groupOrders[group.id] ?? group.teams
          const sorted = [...teams].sort((a, b) => (gPos[a.id] ?? 99) - (gPos[b.id] ?? 99))

          return (
            <div key={group.id} className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-[#2A398D] flex items-center justify-center text-white text-xs font-bold">
                  {group.letter}
                </span>
                Group {group.letter}
              </h3>

              <div className="space-y-1.5">
                {sorted.map((team) => {
                  const pos = gPos[team.id] ?? 1
                  return (
                    <div key={team.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-[#131D42] border-[#1E2B6E]">
                      <select
                        value={pos}
                        onChange={(e) => handlePositionChange(group.id, team.id, parseInt(e.target.value, 10))}
                        disabled={locked}
                        className={`w-14 bg-[#0D1333] border border-[#2A398D]/40 rounded text-xs font-bold text-center py-1 outline-none ${posColor(pos)} ${locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <option value={1}>1st</option>
                        <option value={2}>2nd</option>
                        <option value={3}>3rd</option>
                        <option value={4}>4th</option>
                      </select>
                      {team.flagUrl ? (
                        <img src={team.flagUrl} alt={team.code} className="w-6 h-4 object-cover rounded-sm shrink-0" />
                      ) : (
                        <div className="w-6 h-4 bg-[#1E2B6E] rounded-sm shrink-0" />
                      )}
                      <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">{team.name}</span>
                      <span className="text-[#474A4A] text-xs font-mono shrink-0">{team.code}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
