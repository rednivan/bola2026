"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Trophy, Users, Shield, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { logout } from "@/lib/actions/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/predictions", label: "My Predictions", icon: Trophy },
  { href: "/leagues", label: "Leagues", icon: Users },
]

type Props = {
  user: { displayName: string; email: string; avatarUrl: string | null; role: string }
}

export function Sidebar({ user }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-green-950 border-r border-green-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <span className="text-3xl">⚽</span>
        <div>
          <p className="text-white font-bold text-lg leading-tight">Bola 2026</p>
          <p className="text-green-500 text-xs">World Cup Predictions</p>
        </div>
      </div>

      <Separator className="bg-green-800" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href
                ? "bg-emerald-700 text-white"
                : "text-green-300 hover:bg-green-900 hover:text-white"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}

        {user.role === "ADMIN" && (
          <>
            <Separator className="bg-green-800 my-2" />
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                pathname === "/admin"
                  ? "bg-emerald-700 text-white"
                  : "text-amber-400 hover:bg-green-900 hover:text-amber-300"
              )}
            >
              <Shield className="w-4 h-4" />
              Admin Sync
            </Link>
          </>
        )}
      </nav>

      <Separator className="bg-green-800" />

      {/* User */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatarUrl ?? undefined} />
            <AvatarFallback className="bg-emerald-700 text-white text-sm">
              {user.displayName[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{user.displayName}</p>
            <p className="text-green-500 text-xs truncate">{user.email}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-2 text-green-400 hover:text-red-400 text-sm transition-colors w-full px-1"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
