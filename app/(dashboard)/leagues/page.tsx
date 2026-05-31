import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getCachedTournament, getCachedTournamentCounts } from "@/lib/cache"
import { LeagueActions } from "./league-actions"
import { HowToGuide } from "@/components/how-to-guide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Trophy, Hash, Globe } from "lucide-react"
import Link from "next/link"
import { DeleteLeagueButton } from "./delete-league-button"
import { ShareInviteButton } from "./share-invite-button"

async function getLeaguesData(userId: string) {
  const tournament = await getCachedTournament()
  if (!tournament) return { predictions: [], completedPredictions: [], memberships: [] }

  const [predictions, memberships, counts] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, tournamentId: tournament.id },
      include: {
        _count: {
          select: { matchPredictions: true, standingPredictions: true, thirdPlacePredictions: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leagueMembership.findMany({
      where: { prediction: { userId, tournamentId: tournament.id } },
      include: {
        prediction: { select: { id: true, name: true } },
        league: {
          include: {
            creator: { select: { displayName: true } },
            _count: { select: { memberships: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    getCachedTournamentCounts(tournament.id),
  ])

  const totalItems = counts.matchTotal + counts.standingsTotal + 8 + counts.koTotal
  const completedPredictions = predictions.filter((p) => {
    if (p.status === "COMPLETE") return true
    const saved = p._count.matchPredictions + p._count.standingPredictions + p._count.thirdPlacePredictions
    return totalItems > 0 && saved >= totalItems
  })

  return { predictions, completedPredictions, memberships }
}

export default async function LeaguesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { predictions, completedPredictions, memberships } = await getLeaguesData(user.id)

  return (
    <div className="p-6 lg:p-8 space-y-8 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leagues</h1>
          <p className="text-[#D1D4D1]/60 text-sm mt-1">
            Compete with friends — create a league or join one with a code.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/leagues/browse"
            className="flex items-center gap-1.5 text-sm text-[#D1D4D1]/60 hover:text-white transition-colors border border-[#1E2B6E] rounded-lg px-3 py-1.5 bg-[#131D42]"
          >
            <Globe className="w-3.5 h-3.5" />
            Browse public
          </Link>
          <HowToGuide variant="leagues" />
        </div>
      </div>

      {completedPredictions.length === 0 && (
        <Card className="bg-amber-950/20 border-amber-700/50">
          <CardContent className="py-5 text-amber-300 text-sm">
            You need a completed prediction before joining a league.{" "}
            <a href="/predictions" className="underline font-medium text-amber-200">
              Finish one first →
            </a>
          </CardContent>
        </Card>
      )}

      <LeagueActions predictions={completedPredictions.map((p) => ({ id: p.id, name: p.name }))} />

      {memberships.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-white font-semibold text-lg">My Leagues</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
              <Card key={m.id} className="bg-[#0D1333] border-[#1E2B6E]">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-white text-base leading-snug">
                      <Link href={`/leagues/${m.league.id}`} className="hover:text-[#3CAC3B] transition-colors">
                        {m.league.name}
                      </Link>
                    </CardTitle>
                    <Badge className={m.league.isPublic
                      ? "bg-[#3CAC3B]/20 text-[#3CAC3B] border border-[#3CAC3B]/30 shrink-0"
                      : "bg-[#131D42] text-[#D1D4D1] border border-[#1E2B6E] shrink-0"
                    }>
                      {m.league.isPublic ? "Public" : "Private"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-[#D1D4D1]/60">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {m.league._count.memberships} member{m.league._count.memberships !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      {m.currentRank > 0 ? `Rank #${m.currentRank}` : "Unranked"}
                    </span>
                  </div>

                  {m.league.creatorId === user.id && (
                    <div className="flex items-center gap-2 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-3 py-2">
                      <Hash className="w-3.5 h-3.5 text-[#474A4A]" />
                      <span className="text-[#D1D4D1]/60 text-xs">Join code:</span>
                      <span className="text-white font-mono font-bold tracking-widest text-sm">
                        {m.league.joinCode}
                      </span>
                    </div>
                  )}

                  <p className="text-[#474A4A] text-xs truncate">
                    Created by {m.league.creator.displayName}
                    {" · "}
                    <span className="text-[#D1D4D1]/40">{m.prediction.name}</span>
                  </p>

                  {m.league.creatorId === user.id && (
                    <ShareInviteButton joinCode={m.league.joinCode} leagueName={m.league.name} />
                  )}

                  {m.league.creatorId === user.id && (
                    <DeleteLeagueButton leagueId={m.league.id} leagueName={m.league.name} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {memberships.length === 0 && completedPredictions.length > 0 && (
        <div className="text-center py-12 text-[#474A4A]">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">You haven't joined any leagues yet.</p>
          <p className="text-xs mt-1">Create one above or ask a friend for their join code.</p>
        </div>
      )}
    </div>
  )
}
