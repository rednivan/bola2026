export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
