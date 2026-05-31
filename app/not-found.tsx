import Link from "next/link"
import { Trophy } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#080D28] flex items-center justify-center p-6 text-white">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-[#E61D25] flex items-center justify-center mx-auto mb-6">
          <Trophy className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-6xl font-bold text-[#E61D25] mb-2">404</h1>
        <p className="text-xl font-semibold mb-2">Page not found</p>
        <p className="text-[#D1D4D1]/60 text-sm mb-8">
          This page doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
