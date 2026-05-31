export default function LeaguesLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="h-7 w-28 bg-[#1E2B6E]/50 rounded-lg animate-pulse" />
      <div className="grid gap-6 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-56 bg-[#0D1333] border border-[#1E2B6E] rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-44 bg-[#0D1333] border border-[#1E2B6E] rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}
