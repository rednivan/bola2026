"use client"

import { useActionState, useState, useRef, useEffect } from "react"
import { Pencil, Check, X } from "lucide-react"
import { renamePrediction } from "@/lib/actions/predictions"

export function RenamePrediction({ predictionId, initialName }: { predictionId: string; initialName: string }) {
  const [editing, setEditing] = useState(false)
  const [displayName, setDisplayName] = useState(initialName)
  const [state, action, pending] = useActionState(renamePrediction, {})
  const inputRef = useRef<HTMLInputElement>(null)

  // On successful save, update displayed name and close editor
  useEffect(() => {
    if (state.ok && state.message) {
      setDisplayName(state.message) // action returns new name as message on success
      setEditing(false)
    }
  }, [state])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-2"
        title="Rename prediction"
      >
        <h1 className="text-2xl font-bold">{displayName}</h1>
        <Pencil className="w-4 h-4 text-[#474A4A] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    )
  }

  return (
    <form action={action} className="flex items-center gap-2 flex-wrap">
      <input type="hidden" name="predictionId" value={predictionId} />
      <input
        ref={inputRef}
        name="name"
        defaultValue={displayName}
        maxLength={50}
        disabled={pending}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        className="text-2xl font-bold bg-transparent border-b-2 border-[#E61D25] text-white outline-none min-w-0 w-48 sm:w-64"
      />
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="submit"
          disabled={pending}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-[#3CAC3B]/20 border border-[#3CAC3B]/40 text-[#3CAC3B] hover:bg-[#3CAC3B]/30 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-[#131D42] border border-[#1E2B6E] text-[#474A4A] hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {state.ok === false && state.message && (
        <p className="text-xs text-red-400 w-full">{state.message}</p>
      )}
    </form>
  )
}
