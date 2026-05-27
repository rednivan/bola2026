import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { syncTeamsFromApi, syncMatchesFromApi } from "@/lib/sync"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const mode: string = body.mode ?? "all"

  try {
    const results: Record<string, string> = {}
    if (mode === "teams" || mode === "all") results.teams = await syncTeamsFromApi()
    if (mode === "matches" || mode === "all") results.matches = await syncMatchesFromApi()
    return NextResponse.json({ ok: true, ...results })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
