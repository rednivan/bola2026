"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Users, Globe, CheckCircle2 } from "lucide-react"
import { joinPublicLeague } from "@/lib/actions/leagues"

type League = {
  id: string
  name: string
  creatorName: string
  memberCount: number
  alreadyJoined: boolean
}

type Prediction = {
  id: string
  name: string
}

export function BrowseLeagues({
  leagues,
  predictions,
}: {
  leagues: League[]
  predictions: Prediction[]
}) {
  const [pending, startTransition] = useTransition()
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [joined, setJoined] = useState<Record<string, boolean>>(
    Object.fromEntries(leagues.filter((l) => l.alreadyJoined).map((l) => [l.id, true]))
  )
  const [selectedPrediction, setSelectedPrediction] = useState(predictions[0]?.id ?? "")

  function handleJoin(leagueId: string) {
    if (!selectedPrediction) {
      setMessages((m) => ({ ...m, [leagueId]: "Select a prediction first." }))
      return
    }
    startTransition(async () => {
      const result = await joinPublicLeague(leagueId, selectedPrediction)
      if (result.ok) {
        setJoined((j) => ({ ...j, [leagueId]: true }))
        setMessages((m) => ({ ...m, [leagueId]: "Joined!" }))
      } else {
        setMessages((m) => ({ ...m, [leagueId]: result.message }))
      }
    })
  }

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-[#3CAC3B]" />
            Public Leagues
          </h1>
          <p className="text-[#D1D4D1]/60 text-sm mt-1">
            Open leagues anyone can join — no invite code needed.
          </p>
        </div>
      </div>

      {predictions.length > 0 && leagues.length > 0 && (
        <div className="flex items-center gap-3 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-4 py-3">
          <span className="text-sm text-[#D1D4D1]/70 shrink-0">Join with:</span>
          <select
            value={selectedPrediction}
            onChange={(e) => setSelectedPrediction(e.target.value)}
            className="flex-1 bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-3 py-1.5 text-sm focus:border-[#3CAC3B] focus:outline-none"
          >
            {predictions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {leagues.length === 0 ? (
        <div className="text-center py-16 text-[#474A4A]">
          <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No public leagues yet.</p>
          <p className="text-xs mt-1">Create one from the Leagues page and mark it as public.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => {
            const isJoined = joined[league.id]
            const msg = messages[league.id]

            return (
              <Card key={league.id} className="bg-[#0D1333] border-[#1E2B6E]">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-white text-base leading-snug">{league.name}</CardTitle>
                    {isJoined && (
                      <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] shrink-0 mt-0.5" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-1.5 text-sm text-[#D1D4D1]/60">
                    <Users className="w-3.5 h-3.5" />
                    {league.memberCount} member{league.memberCount !== 1 ? "s" : ""}
                    <span className="mx-1.5 text-[#1E2B6E]">·</span>
                    <span className="text-xs">by {league.creatorName}</span>
                  </div>

                  {msg && (
                    <p className={`text-xs ${msg === "Joined!" ? "text-[#3CAC3B]" : "text-red-400"}`}>
                      {msg}
                    </p>
                  )}

                  {isJoined ? (
                    <Link
                      href={`/leagues`}
                      className="block text-center text-xs text-[#3CAC3B] bg-[#3CAC3B]/10 border border-[#3CAC3B]/30 rounded-lg py-2 hover:bg-[#3CAC3B]/20 transition-colors"
                    >
                      View in My Leagues →
                    </Link>
                  ) : predictions.length === 0 ? (
                    <p className="text-xs text-amber-400">
                      Complete a prediction to join.
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#1E2B6E] hover:bg-[#2A3A8A] text-white text-sm"
                      onClick={() => handleJoin(league.id)}
                      disabled={pending}
                    >
                      Join League
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
