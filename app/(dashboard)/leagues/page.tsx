import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { LeagueActions } from "./league-actions"
import { HowToGuide } from "@/components/how-to-guide"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Trophy, Hash } from "lucide-react"

async function getLeaguesData(userId: string) {
  const prediction = await prisma.prediction.findFirst({
    where: { userId, tournament: { year: 2026 } },
  })

  if (!prediction) return { prediction: null, memberships: [] }

  const memberships = await prisma.leagueMembership.findMany({
    where: { predictionId: prediction.id },
    include: {
      league: {
        include: {
          creator: { select: { displayName: true } },
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  })

  return { prediction, memberships }
}

export default async function LeaguesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { prediction, memberships } = await getLeaguesData(user.id)

  return (
    <div className="p-6 lg:p-8 space-y-8 text-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leagues</h1>
          <p className="text-[#D1D4D1]/60 text-sm mt-1">
            Compete with friends — create a league or join one with a code.
          </p>
        </div>
        <HowToGuide variant="leagues" />
      </div>

      {!prediction && (
        <Card className="bg-amber-950/20 border-amber-700/50">
          <CardContent className="py-5 text-amber-300 text-sm">
            You need a prediction before joining a league.{" "}
            <a href="/predictions/new" className="underline font-medium text-amber-200">
              Create one first →
            </a>
          </CardContent>
        </Card>
      )}

      <LeagueActions hasPrediction={!!prediction} />

      {memberships.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-white font-semibold text-lg">My Leagues</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
              <Card key={m.id} className="bg-[#0D1333] border-[#1E2B6E]">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-white text-base leading-snug">{m.league.name}</CardTitle>
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

                  <p className="text-[#474A4A] text-xs">
                    Created by {m.league.creator.displayName}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {memberships.length === 0 && prediction && (
        <div className="text-center py-12 text-[#474A4A]">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">You haven't joined any leagues yet.</p>
          <p className="text-xs mt-1">Create one above or ask a friend for their join code.</p>
        </div>
      )}
    </div>
  )
}
