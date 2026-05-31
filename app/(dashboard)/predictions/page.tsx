import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getCachedTournament, getCachedTournamentCounts } from "@/lib/cache"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, PlusCircle, ChevronRight, CheckCircle2, Circle } from "lucide-react"

async function getPredictionsData(userId: string) {
  const tournament = await getCachedTournament()
  if (!tournament) return { predictions: [], matchTotal: 0, standingsTotal: 0, koTotal: 0 }

  const [predictions, counts] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, tournamentId: tournament.id },
      include: {
        _count: {
          select: {
            matchPredictions: true,
            standingPredictions: true,
            thirdPlacePredictions: true,
            leagueMemberships: true,
          },
        },
        leagueMemberships: {
          include: { league: { select: { name: true } } },
          take: 3,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    getCachedTournamentCounts(tournament.id),
  ])

  return { predictions, ...counts }
}

export default async function PredictionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { predictions, matchTotal, standingsTotal, koTotal } = await getPredictionsData(user.id)
  const totalItems = matchTotal + standingsTotal + 8 + koTotal

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Predictions</h1>
          <p className="text-[#D1D4D1]/60 text-sm mt-1">
            Create multiple predictions and enter each into different leagues.
          </p>
        </div>
        <Link href="/predictions/new">
          <Button className="bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold gap-2">
            <PlusCircle className="w-4 h-4" />
            New prediction
          </Button>
        </Link>
      </div>

      {predictions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[#E61D25] flex items-center justify-center mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-white font-bold text-lg mb-2">No predictions yet</h2>
          <p className="text-[#D1D4D1]/60 text-sm mb-6 max-w-sm">
            Create your first prediction and start competing in leagues with friends.
          </p>
          <Link href="/predictions/new">
            <Button className="bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold gap-2">
              <PlusCircle className="w-4 h-4" />
              Create prediction
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {predictions.map((p) => {
            const saved = p._count.matchPredictions + p._count.standingPredictions + p._count.thirdPlacePredictions
            const pct = totalItems > 0 ? Math.round((saved / totalItems) * 100) : 0
            const isComplete = p.status === "COMPLETE"

            return (
              <Link key={p.id} href={`/predictions/${p.id}/edit`} className="group">
                <Card className="bg-[#0D1333] border-[#1E2B6E] hover:border-[#2A398D] transition-colors h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#E61D25] flex items-center justify-center shrink-0">
                          <Trophy className="w-4 h-4 text-white" />
                        </div>
                        <CardTitle className="text-white text-base leading-snug truncate">
                          {p.name}
                        </CardTitle>
                      </div>
                      <Badge className={
                        isComplete ? "bg-[#3CAC3B] text-white shrink-0" :
                        p.status === "GROUP_COMPLETE" ? "bg-[#2A398D] text-white shrink-0" :
                        "bg-amber-700 text-white shrink-0"
                      }>
                        {p.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs text-[#D1D4D1]/60 mb-1.5">
                        <span>Completion</span>
                        <span className="font-mono tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-[#1E2B6E] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isComplete ? "bg-[#3CAC3B]" : "bg-[#E61D25]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Section checklist */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {[
                        { label: "Match Results", done: p._count.matchPredictions >= matchTotal },
                        { label: "Standings", done: p._count.standingPredictions >= standingsTotal },
                        { label: "Third Place", done: p._count.thirdPlacePredictions >= 8 },
                        { label: "KO Bracket", done: isComplete },
                      ].map(({ label, done }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          {done
                            ? <CheckCircle2 className="w-3 h-3 text-[#3CAC3B] shrink-0" />
                            : <Circle className="w-3 h-3 text-[#474A4A] shrink-0" />
                          }
                          <span className={`text-xs ${done ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>{label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Leagues */}
                    {p._count.leagueMemberships > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#1E2B6E]">
                        <span className="text-[#474A4A] text-xs">Leagues:</span>
                        {p.leagueMemberships.map((m) => (
                          <span key={m.id} className="text-xs bg-[#131D42] border border-[#1E2B6E] px-2 py-0.5 rounded-full text-[#D1D4D1]/60">
                            {m.league.name}
                          </span>
                        ))}
                        {p._count.leagueMemberships > 3 && (
                          <span className="text-xs text-[#474A4A]">+{p._count.leagueMemberships - 3} more</span>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <span className="text-[#2A398D] group-hover:text-white text-xs flex items-center gap-1 transition-colors">
                        Edit <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
