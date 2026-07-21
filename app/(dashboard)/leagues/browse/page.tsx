import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { findActiveTournament } from "@/lib/tournament"
import { BrowseLeagues } from "./browse-leagues"

export default async function BrowseLeaguesPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const user = session.user

  const tournament = await findActiveTournament()

  const [publicLeagues, userPredictions] = await Promise.all([
    tournament
      ? prisma.league.findMany({
          where: { isPublic: true, tournamentId: tournament.id },
          include: {
            creator: { select: { displayName: true } },
            _count: { select: { memberships: true } },
            memberships: {
              where: { prediction: { userId: user.id } },
              select: { id: true, predictionId: true },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),

    tournament
      ? prisma.prediction.findMany({
          where: { userId: user.id, tournamentId: tournament.id },
          select: { id: true, name: true, status: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ])

  return (
    <BrowseLeagues
      leagues={publicLeagues.map((l) => ({
        id: l.id,
        name: l.name,
        creatorName: l.creator.displayName,
        memberCount: l._count.memberships,
        alreadyJoined: l.memberships.length > 0,
      }))}
      predictions={userPredictions.map((p) => ({ id: p.id, name: p.name }))}
    />
  )
}
