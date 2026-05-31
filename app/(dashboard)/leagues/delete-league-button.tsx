"use client"

import { useState, useTransition } from "react"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { deleteLeague } from "@/lib/actions/leagues"

export function DeleteLeagueButton({ leagueId, leagueName }: { leagueId: string; leagueName: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteLeague(leagueId)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-amber-400 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Delete &ldquo;{leagueName}&rdquo;? This cannot be undone.
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="flex items-center gap-1 text-xs bg-[#E61D25] hover:bg-[#CC1920] text-white px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
            Yes, delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs text-[#D1D4D1]/60 hover:text-white px-2.5 py-1.5 rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-[#E61D25] text-xs w-full">{error}</p>}
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 text-xs text-[#474A4A] hover:text-[#E61D25] transition-colors py-1"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Delete league
    </button>
  )
}
