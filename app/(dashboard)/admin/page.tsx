"use client"

import { useState, useTransition } from "react"
import { syncTeams, syncMatches, syncAll } from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Users, Calendar, Zap, CheckCircle2, XCircle } from "lucide-react"

type Result = { ok: boolean; message: string } | null

export default function AdminPage() {
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState<Record<string, Result>>({})

  function run(key: string, action: () => Promise<Result>) {
    startTransition(async () => {
      setResults((r) => ({ ...r, [key]: null }))
      const result = await action()
      setResults((r) => ({ ...r, [key]: result }))
    })
  }

  const actions = [
    {
      key: "all",
      label: "Sync Everything",
      description: "Import all 48 teams and 104 matches in one shot. Run this first.",
      icon: Zap,
      action: syncAll,
      primary: true,
    },
    {
      key: "teams",
      label: "Sync Teams Only",
      description: "Re-import team data (names, flags, confederation, group assignments).",
      icon: Users,
      action: syncTeams,
      primary: false,
    },
    {
      key: "matches",
      label: "Sync Matches Only",
      description: "Re-import match schedule and update any results that have come in.",
      icon: Calendar,
      action: syncMatches,
      primary: false,
    },
  ]

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Admin Sync</h1>
        <p className="text-[#D1D4D1]/60 text-sm">
          Pull live data from football-data.org into the database.
        </p>
      </div>

      <div className="space-y-4">
        {actions.map(({ key, label, description, icon: Icon, action, primary }) => (
          <Card key={key} className="bg-[#0D1333] border-[#1E2B6E]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${primary ? "text-[#E61D25]" : "text-[#3CAC3B]"}`} />
                  <CardTitle className="text-white text-base">{label}</CardTitle>
                </div>
                {results[key] && (
                  <Badge className={results[key]!.ok ? "bg-[#3CAC3B] text-white" : "bg-[#E61D25] text-white"}>
                    {results[key]!.ok ? "Done" : "Failed"}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-[#D1D4D1]/60">{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {results[key] && (
                <Alert className={results[key]!.ok
                  ? "border-[#3CAC3B]/30 bg-[#3CAC3B]/10"
                  : "border-[#E61D25]/30 bg-[#E61D25]/10"
                }>
                  <div className="flex items-start gap-2">
                    {results[key]!.ok
                      ? <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] mt-0.5" />
                      : <XCircle className="w-4 h-4 text-[#E61D25] mt-0.5" />
                    }
                    <AlertDescription className={results[key]!.ok ? "text-[#3CAC3B]" : "text-[#E61D25]"}>
                      {results[key]!.message}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
              <Button
                onClick={() => run(key, action)}
                disabled={isPending}
                size="sm"
                className={primary
                  ? "bg-[#E61D25] hover:bg-[#CC1920] text-white"
                  : "bg-[#131D42] hover:bg-[#1A2560] text-[#D1D4D1] border border-[#1E2B6E]"
                }
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isPending ? "animate-spin" : ""}`} />
                {isPending ? "Syncing…" : label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-[#0D1333] border-[#1E2B6E] mt-6">
        <CardHeader>
          <CardTitle className="text-white text-base">When to run</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[#D1D4D1]/60 space-y-2">
          <p><span className="text-white">Before the tournament:</span> Run "Sync Everything" once to seed all 48 teams and 104 matches.</p>
          <p><span className="text-white">During group stage:</span> Run "Sync Matches" after each matchday to update scores.</p>
          <p><span className="text-white">After group stage:</span> Run "Sync Everything" to resolve KO bracket placeholders.</p>
        </CardContent>
      </Card>
    </div>
  )
}
