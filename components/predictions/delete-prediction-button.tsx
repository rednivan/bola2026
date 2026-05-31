"use client"

import { useState, useTransition } from "react"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { deletePrediction } from "@/lib/actions/predictions"
import { Button } from "@/components/ui/button"

export function DeletePredictionButton({ predictionId }: { predictionId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    startTransition(async () => {
      const result = await deletePrediction(predictionId)
      if (result?.error) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Delete this prediction? This cannot be undone.
        </span>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDelete}
            disabled={isPending}
            size="sm"
            className="bg-[#E61D25] hover:bg-[#CC1920] text-white"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Yes, delete
          </Button>
          <Button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            size="sm"
            variant="ghost"
            className="text-[#D1D4D1]/60 hover:text-white"
          >
            Cancel
          </Button>
        </div>
        {error && <p className="text-[#E61D25] text-xs w-full">{error}</p>}
      </div>
    )
  }

  return (
    <Button
      onClick={() => setConfirming(true)}
      size="sm"
      variant="ghost"
      className="text-[#474A4A] hover:text-[#E61D25] hover:bg-transparent gap-1.5"
    >
      <Trash2 className="w-4 h-4" />
      Delete
    </Button>
  )
}
