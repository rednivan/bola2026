"use server"

import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { syncTeamsFromApi, syncMatchesFromApi } from "@/lib/sync"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") throw new Error("Forbidden")
}

export async function syncTeams(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const message = await syncTeamsFromApi()
    return { ok: true, message }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function syncMatches(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const message = await syncMatchesFromApi()
    return { ok: true, message }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function syncAll(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const [teams, matches] = await Promise.all([syncTeamsFromApi(), syncMatchesFromApi()])
    return { ok: true, message: `${teams} · ${matches}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
