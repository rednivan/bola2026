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
      variant: "default" as const,
      className: "bg-emerald-600 hover:bg-emerald-500",
    },
    {
      key: "teams",
      label: "Sync Teams Only",
      description: "Re-import team data (names, flags, confederation, group assignments).",
      icon: Users,
      action: syncTeams,
      variant: "outline" as const,
      className: "",
    },
    {
      key: "matches",
      label: "Sync Matches Only",
      description: "Re-import match schedule and update any results that have come in.",
      icon: Calendar,
      action: syncMatches,
      variant: "outline" as const,
      className: "",
    },
  ]

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Admin Sync</h1>
        <p className="text-zinc-400 text-sm">
          Pull live data from football-data.org into the database.
        </p>
      </div>

      <div className="space-y-4">
        {actions.map(({ key, label, description, icon: Icon, action, variant, className }) => (
          <Card key={key} className="bg-zinc-900 border-zinc-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-emerald-400" />
                  <CardTitle className="text-white text-base">{label}</CardTitle>
                </div>
                {results[key] && (
                  <Badge
                    variant={results[key]!.ok ? "default" : "destructive"}
                    className={results[key]!.ok ? "bg-emerald-700" : ""}
                  >
                    {results[key]!.ok ? "Done" : "Failed"}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-zinc-400">{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {results[key] && (
                <Alert
                  className={results[key]!.ok
                    ? "border-emerald-800 bg-emerald-950/50"
                    : "border-red-800 bg-red-950/50"
                  }
                >
                  <div className="flex items-start gap-2">
                    {results[key]!.ok
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                      : <XCircle className="w-4 h-4 text-red-400 mt-0.5" />
                    }
                    <AlertDescription className={results[key]!.ok ? "text-emerald-300" : "text-red-300"}>
                      {results[key]!.message}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
              <Button
                onClick={() => run(key, action)}
                disabled={isPending}
                variant={variant}
                className={className}
                size="sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isPending ? "animate-spin" : ""}`} />
                {isPending ? "Syncing…" : label}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-700 mt-6">
        <CardHeader>
          <CardTitle className="text-white text-base">When to run</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-400 space-y-2">
          <p>• <span className="text-white">Before the tournament:</span> Run "Sync Everything" once to seed all 48 teams and 104 matches.</p>
          <p>• <span className="text-white">During group stage:</span> Run "Sync Matches" after each matchday to update scores and points.</p>
          <p>• <span className="text-white">After group stage:</span> Run "Sync Everything" to resolve KO bracket placeholders with real teams.</p>
        </CardContent>
      </Card>
    </div>
  )
}
