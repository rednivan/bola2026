"use server"

import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") throw new Error("Forbidden")
}

export async function syncTeams(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "teams" }),
  })

  const data = await res.json()
  if (!res.ok) return { ok: false, message: data.error ?? "Sync failed" }
  return { ok: true, message: data.teams ?? "Teams synced" }
}

export async function syncMatches(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "matches" }),
  })

  const data = await res.json()
  if (!res.ok) return { ok: false, message: data.error ?? "Sync failed" }
  return { ok: true, message: data.matches ?? "Matches synced" }
}

export async function syncAll(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin()

  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "all" }),
  })

  const data = await res.json()
  if (!res.ok) return { ok: false, message: data.error ?? "Sync failed" }
  return { ok: true, message: `${data.teams} · ${data.matches}` }
}
