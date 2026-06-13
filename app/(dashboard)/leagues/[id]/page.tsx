import { redirect, notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Trophy, Users, ArrowLeft, Hash, Crown, ChevronRight } from "lucide-react"
import Link from "next/link"
import { ShareInviteButton } from "../share-invite-button"
import { ShareTableButton } from "../share-table-button"

export default async function LeagueStandingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const user = session.user

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, displayName: true } },
      tournament: { select: { name: true, year: true, groupStageStart: true } },
      memberships: {
        include: {
          prediction: {
            select: {
              id: true, name: true, totalScore: true, userId: true,
              user: { select: { displayName: true } },
            },
          },
        },
        // Order by points rather than the cached currentRank — newly joined
        // members default to currentRank 0, which would otherwise sort first.
        orderBy: { prediction: { totalScore: "desc" } },
      },
    },
  })

  if (!league) notFound()

  // Verify current user is a member
  const isMember = league.memberships.some((m) => m.prediction.userId === user.id)
  if (!isMember) notFound()

  const isCreator = league.creatorId === user.id

  // Members' predictions become viewable (read only) once the group stage is frozen
  const groupStageFrozen = new Date() >= league.tournament.groupStageStart

  // Find highest score for % bar scaling
  const maxScore = Math.max(...league.memberships.map((m) => m.prediction.totalScore), 1)

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white">
      <div className="flex items-center gap-3">
        <Link
          href="/leagues"
          className="flex items-center gap-1.5 text-[#D1D4D1]/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Leagues
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <Badge
              className={
                league.isPublic
                  ? "bg-[#3CAC3B]/20 text-[#3CAC3B] border border-[#3CAC3B]/30"
                  : "bg-[#131D42] text-[#D1D4D1] border border-[#1E2B6E]"
              }
            >
              {league.isPublic ? "Public" : "Private"}
            </Badge>
          </div>
          <p className="text-[#D1D4D1]/60 text-sm mt-1 truncate">
            {league.memberships.length} member{league.memberships.length !== 1 ? "s" : ""}
            {" · "}Created by {league.creator.displayName}
          </p>
        </div>
        {isCreator && (
          <ShareInviteButton joinCode={league.joinCode} leagueName={league.name} />
        )}
      </div>

      {isCreator && (
        <div className="flex items-center gap-2 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-3 py-2.5 w-fit">
          <Hash className="w-4 h-4 text-[#474A4A]" />
          <span className="text-[#D1D4D1]/60 text-sm">Join code:</span>
          <span className="text-white font-mono font-bold tracking-widest">{league.joinCode}</span>
        </div>
      )}

      <Card className="bg-[#0D1333] border-[#1E2B6E]" id="standings-table">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            Standings
          </CardTitle>
          <p className="text-[#D1D4D1]/60 text-xs mt-0.5">
            {groupStageFrozen
              ? "Tap a member to see their predictions (read only)."
              : "Member predictions become viewable once the group stage starts."}
          </p>
          <CardAction>
            <ShareTableButton targetId="standings-table" fileName={`${league.name}-standings`} />
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-[#1E2B6E]">
            {league.memberships.map((m, idx) => {
              const isMe = m.prediction.userId === user.id
              const rank = m.currentRank > 0 ? m.currentRank : idx + 1
              const scorePercent = maxScore > 0 ? (m.prediction.totalScore / maxScore) * 100 : 0

              const rowClassName = `flex items-center gap-4 px-4 py-3.5 ${isMe ? "bg-[#1A2560]/50" : ""} ${
                groupStageFrozen ? "hover:bg-[#1A2560]/80 transition-colors" : ""
              }`

              const rowContent = (
                <>
                  {/* Rank */}
                  <div className="w-8 shrink-0 text-center">
                    {rank === 1 ? (
                      <Crown className="w-4 h-4 text-yellow-400 mx-auto" />
                    ) : (
                      <span
                        className={`text-sm font-bold ${
                          rank <= 3 ? "text-[#3CAC3B]" : "text-[#474A4A]"
                        }`}
                      >
                        #{rank}
                      </span>
                    )}
                  </div>

                  {/* Name + score bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                        <span className={`text-sm font-medium shrink-0 ${isMe ? "text-[#3CAC3B]" : "text-white"}`}>
                          {m.prediction.name}
                        </span>
                        <span className="text-[#474A4A] text-xs truncate min-w-0">
                          {m.prediction.user.displayName}
                        </span>
                      </div>
                      {isMe && (
                        <span className="text-[#3CAC3B] text-xs shrink-0">★ you</span>
                      )}
                    </div>
                    <div className="h-1.5 bg-[#1E2B6E] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isMe ? "bg-[#3CAC3B]" : "bg-[#2A3A8A]"}`}
                        style={{ width: `${scorePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <span className={`text-base font-bold ${isMe ? "text-[#3CAC3B]" : "text-white"}`}>
                      {m.prediction.totalScore}
                    </span>
                    <span className="text-[#474A4A] text-xs ml-1">pts</span>
                  </div>

                  {groupStageFrozen && (
                    <ChevronRight className="w-4 h-4 text-[#474A4A] shrink-0" />
                  )}
                </>
              )

              return groupStageFrozen ? (
                <Link key={m.id} href={`/leagues/${id}/${m.prediction.id}`} className={rowClassName}>
                  {rowContent}
                </Link>
              ) : (
                <div key={m.id} className={rowClassName}>
                  {rowContent}
                </div>
              )
            })}

            {league.memberships.length === 0 && (
              <div className="text-center py-12 text-[#474A4A]">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No members yet.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
