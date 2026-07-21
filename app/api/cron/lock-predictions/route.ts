import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { findActiveTournament } from "@/lib/tournament"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const now = new Date()
  const tournament = await findActiveTournament()
  if (!tournament) return NextResponse.json({ ok: true, message: "No tournament found" })

  let groupLocked = 0
  let koLocked = 0

  if (now >= tournament.groupStageStart) {
    const result = await prisma.prediction.updateMany({
      where: { tournamentId: tournament.id, groupLocked: false },
      data: { groupLocked: true },
    })
    groupLocked = result.count
  }

  if (now >= tournament.knockoutStageStart) {
    const result = await prisma.prediction.updateMany({
      where: { tournamentId: tournament.id, koLocked: false },
      data: { koLocked: true },
    })
    koLocked = result.count
  }

  return NextResponse.json({ ok: true, groupLocked, koLocked })
}
