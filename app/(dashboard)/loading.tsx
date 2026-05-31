export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="h-8 w-48 bg-[#1E2B6E]/50 rounded-lg animate-pulse" />
      <div className="h-4 w-72 bg-[#1E2B6E]/30 rounded animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-48 bg-[#0D1333] border border-[#1E2B6E] rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}
