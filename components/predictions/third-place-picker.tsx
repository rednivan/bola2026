"use client"

import { useState } from "react"
import { Save, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveThirdPlacePicks } from "@/lib/actions/predictions"

type Group = {
  id: string
  letter: string
  thirdPlaceTeam?: { id: string; name: string; code: string; flagUrl: string } | null
}

type Props = {
  predictionId: string
  groups: Group[]
  savedGroupIds: string[]
  locked: boolean
  onSelectionChange?: (groupIds: string[]) => void
  onSaveSuccess?: () => void
  // Admin-confirmed final 8 qualifying groups. Undefined/incomplete means not finalized yet.
  actualQualifiedGroupIds?: string[]
}

const MAX_PICKS = 8

export function ThirdPlacePicker({ predictionId, groups, savedGroupIds, locked, onSelectionChange, onSaveSuccess, actualQualifiedGroupIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(savedGroupIds))
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const isFinalized = locked && !!actualQualifiedGroupIds && actualQualifiedGroupIds.length === 8
  const actualSet = new Set(actualQualifiedGroupIds ?? [])
  const correctCount = isFinalized ? [...selected].filter((id) => actualSet.has(id)).length : 0

  function toggle(groupId: string) {
    if (locked) return
    const next = new Set(selected)
    if (next.has(groupId)) next.delete(groupId)
    else if (next.size < MAX_PICKS) next.add(groupId)
    setSelected(next)
    onSelectionChange?.([...next])
    setStatus("idle")
  }

  function handleSave() {
    if (selected.size !== MAX_PICKS) return
    setStatus("saved")
    onSaveSuccess?.()

    saveThirdPlacePicks(predictionId, [...selected]).then(result => {
      if (!result.ok) { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  const remaining = MAX_PICKS - selected.size

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            Third-Place Qualifiers
            {isFinalized && (
              <span className={`text-xs font-bold tabular-nums ${correctCount > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                {correctCount}/8 pts
              </span>
            )}
          </h2>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Select 8 of the 12 third-place finishers you predict will advance to the Round of 32.
          </p>
          <p className="text-[#D1D4D1]/70 text-xs mt-1">
            In 2026, every group produces a 3rd-place team — but only the 8 with the best records across all groups qualify. You score points for each group you correctly include or exclude.
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
            <Button
              onClick={handleSave}
              disabled={selected.size !== MAX_PICKS}
              className="bg-[#E61D25] hover:bg-[#CC1920] text-white disabled:opacity-40"
            >
              <Save className="w-4 h-4 mr-2" /> Save picks
            </Button>
          </div>
        )}

        {locked && <Badge className="bg-[#131D42] border border-[#1E2B6E] text-[#D1D4D1]">Locked</Badge>}
      </div>

      {/* Progress dots */}
      <div className="flex items-center gap-3">
        <div className="flex-1 flex gap-1.5">
          {Array.from({ length: MAX_PICKS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < selected.size ? "bg-[#3CAC3B]" : "bg-[#1E2B6E]"
              }`}
            />
          ))}
        </div>
        <span className={`text-sm shrink-0 ${remaining === 0 ? "text-[#3CAC3B]" : "text-[#D1D4D1]/60"}`}>
          {remaining === 0 ? "8/8 ✓" : `${selected.size}/8`}
        </span>
      </div>

      {/* Group grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {groups.map((group) => {
          const isSelected = selected.has(group.id)
          const isDisabled = !isSelected && selected.size >= MAX_PICKS
          const wasCorrect = isFinalized && isSelected && actualSet.has(group.id)
          const wasWrong = isFinalized && isSelected && !actualSet.has(group.id)

          return (
            <button
              key={group.id}
              onClick={() => toggle(group.id)}
              disabled={locked || isDisabled}
              className={`relative p-4 rounded-xl border-2 text-left transition-all
                ${wasCorrect
                  ? "border-[#3CAC3B] bg-[#3CAC3B]/10 shadow-md shadow-[#3CAC3B]/10"
                  : wasWrong
                  ? "border-[#E61D25] bg-[#E61D25]/10"
                  : isSelected
                  ? "border-[#3CAC3B] bg-[#3CAC3B]/10 shadow-md shadow-[#3CAC3B]/10"
                  : isDisabled
                  ? "border-[#1E2B6E] bg-[#0D1333]/50 opacity-30 cursor-not-allowed"
                  : "border-[#1E2B6E] bg-[#0D1333] hover:border-[#2A398D] cursor-pointer"
                }
                ${locked ? "cursor-not-allowed" : ""}
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${wasCorrect ? "bg-[#3CAC3B] text-white" : wasWrong ? "bg-[#E61D25] text-white" : isSelected ? "bg-[#3CAC3B] text-white" : "bg-[#1E2B6E] text-[#D1D4D1]"}`}>
                  {group.letter}
                </span>
                <span className={`text-xs font-medium ${wasCorrect ? "text-[#3CAC3B]" : wasWrong ? "text-[#E61D25]" : isSelected ? "text-[#3CAC3B]" : "text-[#D1D4D1]/60"}`}>
                  Group {group.letter}
                </span>
              </div>

              {group.thirdPlaceTeam ? (
                <div className="flex items-center gap-2">
                  {group.thirdPlaceTeam.flagUrl && (
                    <img
                      src={group.thirdPlaceTeam.flagUrl}
                      alt={group.thirdPlaceTeam.code}
                      className="w-6 h-4 object-cover rounded-sm shrink-0"
                    />
                  )}
                  <span className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-[#D1D4D1]"}`}>
                    {group.thirdPlaceTeam.name}
                  </span>
                </div>
              ) : (
                <p className="text-[#474A4A] text-xs italic">3rd place TBD</p>
              )}

              {wasCorrect && <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] absolute top-3 right-3" />}
              {wasWrong && <XCircle className="w-4 h-4 text-[#E61D25] absolute top-3 right-3" />}
              {!isFinalized && isSelected && (
                <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] absolute top-3 right-3" />
              )}
            </button>
          )
        })}
      </div>

      <p className="text-[#474A4A] text-xs">
        In the 2026 format, the 8 best-performing third-place teams advance to the Round of 32.
        Scored after the group stage concludes.
      </p>
    </div>
  )
}
