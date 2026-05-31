import Link from "next/link"

export default function UnsubscribedPage() {
  return (
    <div className="min-h-screen bg-[#0A0E28] flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-full bg-[#3CAC3B]/20 border border-[#3CAC3B]/30 flex items-center justify-center mx-auto">
          <span className="text-2xl">✓</span>
        </div>
        <h1 className="text-white text-xl font-bold">Unsubscribed</h1>
        <p className="text-[#D1D4D1]/60 text-sm">
          You've been removed from Bola 2026 emails.
          You won't receive matchday results or reminders.
        </p>
        <Link
          href="/dashboard"
          className="inline-block text-sm text-[#3CAC3B] hover:underline"
        >
          Back to app →
        </Link>
      </div>
    </div>
  )
}
