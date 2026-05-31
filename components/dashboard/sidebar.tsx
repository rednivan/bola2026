"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Trophy, Users, Shield, LogOut, UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { logout } from "@/lib/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const nav = [
  { href: "/dashboard",    label: "Dashboard",      icon: LayoutDashboard },
  { href: "/predictions",  label: "Predictions",    icon: Trophy },
  { href: "/leagues",      label: "Leagues",        icon: Users },
]

type Props = {
  user: { displayName: string; email: string; avatarUrl: string | null; role: string }
}

export function Sidebar({ user }: Props) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href))

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 min-h-screen bg-[#2A398D] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[#1D2B78]">
          <div className="w-9 h-9 rounded-full bg-[#E61D25] flex items-center justify-center shadow-md shadow-[#E61D25]/40">
            <span className="text-lg">⚽</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">Bola 2026</p>
            <p className="text-[#D1D4D1]/60 text-xs">World Cup Predictions</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive(href)
                  ? "bg-[#E61D25] text-white shadow-md shadow-[#E61D25]/30"
                  : "text-[#D1D4D1] hover:bg-[#1D2B78] hover:text-white"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}

          {user.role === "ADMIN" && (
            <>
              <div className="my-2 border-t border-[#1D2B78]" />
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  pathname === "/admin"
                    ? "bg-[#E61D25] text-white"
                    : "text-amber-300 hover:bg-[#1D2B78] hover:text-amber-200"
                )}
              >
                <Shield className="w-4 h-4" />
                Admin Sync
              </Link>
            </>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-[#1D2B78] px-4 py-4">
          <Link href="/profile" className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity">
            <Avatar className="h-9 w-9">
              <AvatarImage src={user.avatarUrl ?? undefined} />
              <AvatarFallback className="bg-[#E61D25] text-white text-sm font-bold">
                {user.displayName[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-[#D1D4D1]/60 text-xs truncate">{user.email}</p>
            </div>
            <UserCircle className="w-4 h-4 text-[#D1D4D1]/40 shrink-0" />
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-2 text-[#D1D4D1]/60 hover:text-[#E61D25] text-sm transition-colors w-full px-1"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 md:hidden z-50 bg-[#2A398D] border-t border-[#1D2B78] safe-area-inset-bottom">
        <nav className="flex items-stretch">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
                isActive(href)
                  ? "text-[#E61D25]"
                  : "text-[#D1D4D1]/70 hover:text-white"
              )}
            >
              <Icon className={cn("w-5 h-5 mb-0.5", isActive(href) && "drop-shadow-[0_0_6px_#E61D25]")} />
              {label}
            </Link>
          ))}

          {user.role === "ADMIN" && (
            <Link
              href="/admin"
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
                pathname === "/admin" ? "text-amber-300" : "text-[#D1D4D1]/70"
              )}
            >
              <Shield className="w-5 h-5 mb-0.5" />
              Admin
            </Link>
          )}

          <form action={logout} className="flex-1">
            <button
              type="submit"
              className="w-full h-full flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium text-[#D1D4D1]/70 hover:text-[#E61D25] transition-colors"
            >
              <LogOut className="w-5 h-5 mb-0.5" />
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </>
  )
}
