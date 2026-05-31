"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#080D28] flex items-center justify-center p-6 text-white">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-[#E61D25]/20 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-[#E61D25]" />
        </div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-[#D1D4D1]/60 text-sm mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
