export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05071A] p-4">
      {/* Subtle diagonal stripe accent top-left */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#2A398D]/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#E61D25]/10 blur-3xl" />
      </div>
      <div className="w-full max-w-md relative z-10">{children}</div>
    </div>
  )
}
