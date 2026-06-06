"use client"

import { useState, useTransition } from "react"
import {
  syncTeams, syncMatches, syncAll,
  updateMatchScore, recalculateScores, triggerMatchdayEmails, sendKOReminder,
  updateTournamentDates, saveGroupStandings, calculateGroupStandingPoints,
  saveThirdPlaceQualifiers, calculateThirdPlacePoints,
} from "@/lib/actions/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  RefreshCw, Users, Calendar, Zap, CheckCircle2, XCircle,
  PenLine, BarChart2, Mail, Send, Bell, CalendarDays, List, Star,
  Activity, AlertTriangle, Clock, Minus,
} from "lucide-react"
import { HowToGuide } from "@/components/how-to-guide"

type Result = { ok: boolean; message: string } | null

// ─── Shared helpers ───────────────────────────────────────────────────────────

function ResultAlert({ result }: { result: Result }) {
  if (!result) return null
  return (
    <Alert className={result.ok ? "border-[#3CAC3B]/30 bg-[#3CAC3B]/10" : "border-[#E61D25]/30 bg-[#E61D25]/10"}>
      <div className="flex items-start gap-2">
        {result.ok
          ? <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] mt-0.5 shrink-0" />
          : <XCircle className="w-4 h-4 text-[#E61D25] mt-0.5 shrink-0" />}
        <AlertDescription className={result.ok ? "text-[#3CAC3B]" : "text-[#E61D25]"}>
          {result.message}
        </AlertDescription>
      </div>
    </Alert>
  )
}

// ─── Types passed from server ─────────────────────────────────────────────────

export type MatchRow = {
  id: string
  stage: string
  matchNumber: number
  kickoff: Date
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeamName: string | null
  homeTeamCode: string | null
  awayTeamName: string | null
  awayTeamCode: string | null
  homeTeamPlaceholder: string | null
  awayTeamPlaceholder: string | null
  homeScore: number | null
  awayScore: number | null
  group: string | null // group letter
}

export type MatchdayStatus = {
  date: string       // "YYYY-MM-DD"
  matchCount: number
  emailsSent: number
}

export type KOReminderStatus = {
  sentCount: number
  totalUsers: number
}

export type TournamentDates = {
  groupStageStart: string   // ISO datetime-local "YYYY-MM-DDTHH:mm"
  groupStageEnd: string
  knockoutStageStart: string
}

export type GroupData = {
  id: string
  letter: string
  teams: {
    teamId: string
    name: string
    code: string
    actualPosition: number | null
    thirdPlaceQualified: boolean
  }[]
}

export type CronActivity = {
  logs: { job: string; ok: boolean; message: string; createdAt: Date }[]
  emailsSentToday: number
}

// ─── Panel 0: Cron Activity ───────────────────────────────────────────────────

const JOB_LABELS: Record<string, string> = {
  "sync-and-score":      "Sync & Score",
  "send-matchday-emails": "Matchday Emails",
  "lock-predictions":    "Lock Predictions",
}

const FAILURE_ACTIONS: Record<string, string> = {
  "sync-and-score":       "Run Sync Matches manually, then Recalculate Scores.",
  "send-matchday-emails": "Use the Matchday Emails panel below to send manually.",
  "lock-predictions":     "Check tournament dates are set correctly in Tournament Dates.",
}

function CronActivityPanel({ activity }: { activity: CronActivity }) {
  const { logs, emailsSentToday } = activity

  const syncLogs   = logs.filter((l) => l.job === "sync-and-score")
  const emailLogs  = logs.filter((l) => l.job === "send-matchday-emails")
  const failedLogs = logs.filter((l) => !l.ok)

  const lastSync  = syncLogs.at(-1)
  const lastEmail = emailLogs.at(-1)

  function fmt(d: Date) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
  }

  return (
    <Card className="bg-[#0D1333] border-[#1E2B6E]">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#3CAC3B]" />
          <CardTitle className="text-white text-base">Today's Automation Activity</CardTitle>
        </div>
        <CardDescription className="text-[#D1D4D1]/60 text-xs">
          Cron runs since UTC midnight · refreshes on page reload
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#131D42] border border-[#1E2B6E] rounded-lg p-3 text-center">
            <p className="text-white font-bold text-xl tabular-nums">{syncLogs.filter((l) => l.ok).length}</p>
            <p className="text-[#D1D4D1]/60 text-xs mt-0.5">Syncs run</p>
          </div>
          <div className="bg-[#131D42] border border-[#1E2B6E] rounded-lg p-3 text-center">
            <p className="text-white font-bold text-xl tabular-nums">{emailsSentToday}</p>
            <p className="text-[#D1D4D1]/60 text-xs mt-0.5">Emails sent</p>
          </div>
          <div className={`rounded-lg p-3 text-center border ${failedLogs.length > 0 ? "bg-[#E61D25]/10 border-[#E61D25]/40" : "bg-[#131D42] border-[#1E2B6E]"}`}>
            <p className={`font-bold text-xl tabular-nums ${failedLogs.length > 0 ? "text-[#E61D25]" : "text-white"}`}>{failedLogs.length}</p>
            <p className="text-[#D1D4D1]/60 text-xs mt-0.5">Failures</p>
          </div>
        </div>

        {/* Last run status for each job */}
        <div className="space-y-2">
          {[
            { label: "Last sync & score", log: lastSync },
            { label: "Last email run",    log: lastEmail },
          ].map(({ label, log }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-[#1E2B6E] last:border-0">
              <div className="flex items-center gap-2">
                {log
                  ? log.ok
                    ? <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] shrink-0" />
                    : <XCircle className="w-4 h-4 text-[#E61D25] shrink-0" />
                  : <Clock className="w-4 h-4 text-[#474A4A] shrink-0" />
                }
                <span className="text-[#D1D4D1]/70 text-sm">{label}</span>
              </div>
              <span className="text-xs text-[#474A4A] tabular-nums">
                {log ? fmt(log.createdAt) : "not yet today"}
              </span>
            </div>
          ))}
        </div>

        {/* Failures with recommended actions */}
        {failedLogs.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-[#E61D25] text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Action required
            </p>
            {failedLogs.map((log, i) => (
              <div key={i} className="bg-[#E61D25]/10 border border-[#E61D25]/30 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[#E61D25] text-sm font-medium">{JOB_LABELS[log.job] ?? log.job} failed</span>
                  <span className="text-[#474A4A] text-xs tabular-nums">{fmt(log.createdAt)}</span>
                </div>
                <p className="text-[#D1D4D1]/60 text-xs font-mono break-all">{log.message}</p>
                <p className="text-amber-400 text-xs">
                  ➜ {FAILURE_ACTIONS[log.job] ?? "Check logs and retry manually."}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* All clear */}
        {logs.length > 0 && failedLogs.length === 0 && (
          <p className="text-[#3CAC3B] text-xs flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> All cron jobs running cleanly today
          </p>
        )}

        {logs.length === 0 && (
          <p className="text-[#474A4A] text-xs">No cron runs recorded yet today.</p>
        )}

      </CardContent>
    </Card>
  )
}

// ─── Panel 1: Sync ────────────────────────────────────────────────────────────

function SyncPanel() {
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
    { key: "all",     label: "Sync Everything",   description: "Import all teams and matches in one shot.", icon: Zap,      action: syncAll,     primary: true  },
    { key: "teams",   label: "Sync Teams Only",    description: "Re-import team data (names, flags, groups).",              icon: Users,     action: syncTeams,   primary: false },
    { key: "matches", label: "Sync Matches Only",  description: "Re-import match schedule and any new results.",            icon: Calendar,  action: syncMatches, primary: false },
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg">Data Sync</h2>
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
            <ResultAlert result={results[key] ?? null} />
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
    </section>
  )
}

// ─── Panel 1b: Tournament dates ───────────────────────────────────────────────

function TournamentDatesPanel({ dates }: { dates: TournamentDates | null }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result>(null)
  const [vals, setVals] = useState<TournamentDates>(dates ?? {
    groupStageStart: "", groupStageEnd: "", knockoutStageStart: "",
  })

  function save() {
    startTransition(async () => {
      setResult(null)
      const r = await updateTournamentDates(vals.groupStageStart, vals.groupStageEnd, vals.knockoutStageStart)
      setResult(r)
    })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-[#3CAC3B]" />
        Tournament Dates
      </h2>
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="py-5 space-y-4">
          <p className="text-[#D1D4D1]/60 text-sm">
            These dates control when group picks lock, when the KO update window opens,
            and when KO picks lock. All times are in UTC.
          </p>
          {(["groupStageStart", "groupStageEnd", "knockoutStageStart"] as const).map((field) => {
            const labels: Record<typeof field, string> = {
              groupStageStart: "Group stage starts (group picks lock)",
              groupStageEnd: "Group stage ends (KO update window opens)",
              knockoutStageStart: "Knockout stage starts (KO picks lock)",
            }
            return (
              <div key={field} className="space-y-1.5">
                <Label className="text-[#D1D4D1] text-sm">{labels[field]}</Label>
                <Input
                  type="datetime-local"
                  value={vals[field]}
                  onChange={(e) => setVals((v) => ({ ...v, [field]: e.target.value }))}
                  className="bg-[#1A2560] border-[#1E2B6E] text-white"
                />
              </div>
            )
          })}
          <ResultAlert result={result} />
          <Button
            onClick={save}
            disabled={isPending}
            size="sm"
            className="bg-[#3CAC3B] hover:bg-[#2d9430] text-white font-semibold"
          >
            {isPending ? "Saving…" : "Save dates"}
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Panel 2: Manual score editor ────────────────────────────────────────────

function ScoreEditorPanel({ matches }: { matches: MatchRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [scores, setScores] = useState<Record<string, { home: string; away: string; winner: string }>>(() =>
    Object.fromEntries(
      matches.map((m) => [
        m.id,
        {
          home: m.homeScore != null ? String(m.homeScore) : "",
          away: m.awayScore != null ? String(m.awayScore) : "",
          winner: "",
        },
      ])
    )
  )
  const [results, setResults] = useState<Record<string, Result>>({})
  const [filter, setFilter] = useState<"all" | "pending" | "scored">("pending")

  function setScore(matchId: string, field: "home" | "away" | "winner", value: string) {
    setScores((s) => ({ ...s, [matchId]: { ...s[matchId], [field]: value } }))
  }

  function save(match: MatchRow) {
    const s = scores[match.id]
    const homeScore = parseInt(s.home, 10)
    const awayScore = parseInt(s.away, 10)
    if (isNaN(homeScore) || isNaN(awayScore)) {
      setResults((r) => ({ ...r, [match.id]: { ok: false, message: "Enter valid scores." } }))
      return
    }
    startTransition(async () => {
      setResults((r) => ({ ...r, [match.id]: null }))
      const result = await updateMatchScore(match.id, homeScore, awayScore, s.winner || null)
      setResults((r) => ({ ...r, [match.id]: result }))
    })
  }

  const filtered = matches.filter((m) => {
    if (filter === "pending") return m.homeScore === null
    if (filter === "scored") return m.homeScore !== null
    return true
  })

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2">
          <PenLine className="w-4 h-4 text-[#E61D25]" />
          Manual Score Entry
        </h2>
        <div className="flex gap-1">
          {(["all", "pending", "scored"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${
                filter === f
                  ? "bg-[#2A398D] text-white"
                  : "bg-[#131D42] text-[#D1D4D1]/60 hover:text-white border border-[#1E2B6E]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[#D1D4D1]/60 text-sm">
        Use when the football-data.org API hasn't updated a score. Run <strong className="text-white">Recalculate Scores</strong> after saving.
      </p>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-[#474A4A] text-sm py-4 text-center">No matches in this filter.</p>
        )}
        {filtered.map((m) => {
          const s = scores[m.id]
          const label = m.group ? `Group ${m.group}` : m.stage
          const kickoff = new Date(m.kickoff).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          const homeName = m.homeTeamName ?? m.homeTeamPlaceholder ?? "TBD"
          const awayName = m.awayTeamName ?? m.awayTeamPlaceholder ?? "TBD"
          const isKO = m.stage !== "GROUP"
          const scoresLevel = s.home !== "" && s.away !== "" && s.home === s.away && isKO

          return (
            <Card key={m.id} className="bg-[#0D1333] border-[#1E2B6E]">
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[#D1D4D1]/60 text-xs">{label} · #{m.matchNumber} · {kickoff}</span>
                  {m.homeScore != null && (
                    <Badge className="bg-[#2A398D] text-white text-xs">
                      Current: {m.homeScore}–{m.awayScore}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm flex-1 min-w-[80px] text-right">{homeName}</span>
                  <Input
                    type="number" min={0} max={99} value={s.home}
                    onChange={(e) => setScore(m.id, "home", e.target.value)}
                    className="w-14 text-center bg-[#1A2560] border-[#1E2B6E] text-white p-1"
                  />
                  <span className="text-[#D1D4D1]/40">–</span>
                  <Input
                    type="number" min={0} max={99} value={s.away}
                    onChange={(e) => setScore(m.id, "away", e.target.value)}
                    className="w-14 text-center bg-[#1A2560] border-[#1E2B6E] text-white p-1"
                  />
                  <span className="text-white font-medium text-sm flex-1 min-w-[80px]">{awayName}</span>
                  <Button
                    onClick={() => save(m)}
                    disabled={isPending}
                    size="sm"
                    className="bg-[#131D42] hover:bg-[#1A2560] text-[#D1D4D1] border border-[#1E2B6E] ml-auto"
                  >
                    Save
                  </Button>
                </div>

                {scoresLevel && (
                  <div className="space-y-1.5">
                    <Label className="text-[#D1D4D1]/60 text-xs">Winner (pens / AET)</Label>
                    <select
                      value={s.winner}
                      onChange={(e) => setScore(m.id, "winner", e.target.value)}
                      className="w-full bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-3 py-2 text-sm"
                    >
                      <option value="">— select winner —</option>
                      {m.homeTeamId && <option value={m.homeTeamId}>{homeName}</option>}
                      {m.awayTeamId && <option value={m.awayTeamId}>{awayName}</option>}
                    </select>
                  </div>
                )}

                <ResultAlert result={results[m.id] ?? null} />
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}

// ─── Panel 3: Recalculate scores ──────────────────────────────────────────────

function RecalculatePanel() {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<Result>(null)

  function run() {
    startTransition(async () => {
      setResult(null)
      const r = await recalculateScores()
      setResult(r)
    })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-[#3CAC3B]" />
        Recalculate Scores
      </h2>
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="py-5 space-y-4">
          <p className="text-[#D1D4D1]/60 text-sm">
            Recomputes every prediction's points from current match results, updates
            total scores, and re-ranks all league tables. Run after entering scores manually or if
            something looks off.
          </p>
          <ResultAlert result={result} />
          <Button
            onClick={run}
            disabled={isPending}
            className="bg-[#3CAC3B] hover:bg-[#2d9430] text-white font-semibold"
          >
            <BarChart2 className={`w-4 h-4 mr-2 ${isPending ? "animate-pulse" : ""}`} />
            {isPending ? "Recalculating…" : "Recalculate all scores"}
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Panel 4: Email management ────────────────────────────────────────────────

function EmailPanel({ matchdays }: { matchdays: MatchdayStatus[] }) {
  const [isPending, startTransition] = useTransition()
  const [selected, setSelected] = useState(matchdays[0]?.date ?? "")
  const [force, setForce] = useState(false)
  const [result, setResult] = useState<Result>(null)

  const current = matchdays.find((m) => m.date === selected)

  function send() {
    if (!selected) return
    startTransition(async () => {
      setResult(null)
      const r = await triggerMatchdayEmails(selected, force)
      setResult(r)
    })
  }

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <Mail className="w-4 h-4 text-[#2A398D]" />
        Matchday Emails
      </h2>
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="py-5 space-y-4">
          <p className="text-[#D1D4D1]/60 text-sm">
            Send or resend the results email for a specific matchday. The cron runs every 2 hours
            automatically — use this for manual overrides or corrections.
          </p>

          {matchdays.length === 0 ? (
            <p className="text-[#474A4A] text-sm">No completed match days yet.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-[#D1D4D1] text-sm">Match day</Label>
                <select
                  value={selected}
                  onChange={(e) => { setSelected(e.target.value); setResult(null) }}
                  className="w-full bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-3 py-2 text-sm"
                >
                  {matchdays.map((m) => (
                    <option key={m.date} value={m.date}>
                      {m.date} — {m.matchCount} match{m.matchCount !== 1 ? "es" : ""} · {m.emailsSent} email{m.emailsSent !== 1 ? "s" : ""} sent
                    </option>
                  ))}
                </select>
              </div>

              {current && current.emailsSent > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="force-resend"
                    checked={force}
                    onChange={(e) => setForce(e.target.checked)}
                    className="rounded border-[#1E2B6E] bg-[#1A2560]"
                  />
                  <Label htmlFor="force-resend" className="text-[#D1D4D1]/60 text-sm cursor-pointer">
                    Force resend (emails {current.emailsSent} users again — use after corrections)
                  </Label>
                </div>
              )}

              <ResultAlert result={result} />

              <Button
                onClick={send}
                disabled={isPending || !selected}
                className="bg-[#2A398D] hover:bg-[#1E2B6E] text-white font-semibold"
              >
                <Send className={`w-4 h-4 mr-2 ${isPending ? "animate-pulse" : ""}`} />
                {isPending ? "Sending…" : force ? "Force resend" : "Send emails"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Panel 5: KO window reminder ─────────────────────────────────────────────

function KOReminderPanel({ status }: { status: KOReminderStatus }) {
  const [isPending, startTransition] = useTransition()
  const [force, setForce] = useState(false)
  const [result, setResult] = useState<Result>(null)

  function send() {
    startTransition(async () => {
      setResult(null)
      const r = await sendKOReminder(force)
      setResult(r)
    })
  }

  const alreadySentAll = status.sentCount >= status.totalUsers && status.totalUsers > 0

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <Bell className="w-4 h-4 text-amber-400" />
        KO Window Reminder
      </h2>
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="py-5 space-y-4">
          <p className="text-[#D1D4D1]/60 text-sm">
            Sends every user a personalised email explaining the KO update window, with
            direct links to each of their predictions and the deadline for locking picks.
            Send this as soon as all group stage results are in.
          </p>

          {status.totalUsers > 0 && (
            <div className="flex items-center gap-2 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-4 py-3 text-sm">
              <span className="text-[#D1D4D1]/60">Status:</span>
              <span className="text-white font-medium">
                {status.sentCount} / {status.totalUsers} users emailed
              </span>
              {alreadySentAll && (
                <Badge className="bg-[#3CAC3B] text-white ml-auto">All sent</Badge>
              )}
            </div>
          )}

          {alreadySentAll && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ko-force"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded border-[#1E2B6E] bg-[#1A2560]"
              />
              <Label htmlFor="ko-force" className="text-[#D1D4D1]/60 text-sm cursor-pointer">
                Force resend to all users (use if deadline or instructions changed)
              </Label>
            </div>
          )}

          <ResultAlert result={result} />

          <Button
            onClick={send}
            disabled={isPending || (alreadySentAll && !force)}
            className="bg-amber-700 hover:bg-amber-600 text-white font-semibold"
          >
            <Bell className={`w-4 h-4 mr-2 ${isPending ? "animate-pulse" : ""}`} />
            {isPending ? "Sending…" : force ? "Force resend KO reminder" : "Send KO window reminder"}
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Panel 6: Group standings + 3rd-place ─────────────────────────────────────

function GroupStandingsPanel({ groups }: { groups: GroupData[] }) {
  const [isPending, startTransition] = useTransition()

  // positions[groupId][teamId] = selected position (1-4)
  const [positions, setPositions] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(
      groups.map((g) => [
        g.id,
        Object.fromEntries(g.teams.map((t) => [t.teamId, t.actualPosition ? String(t.actualPosition) : ""])),
      ])
    )
  )

  // third-place qualified group IDs
  const [qualifiedGroups, setQualifiedGroups] = useState<Set<string>>(() =>
    new Set(groups.filter((g) => g.teams.some((t) => t.thirdPlaceQualified)).map((g) => g.id))
  )

  const [results, setResults] = useState<Record<string, Result>>({})

  function setPos(groupId: string, teamId: string, value: string) {
    setPositions((p) => ({
      ...p,
      [groupId]: { ...p[groupId], [teamId]: value },
    }))
  }

  function toggleQualified(groupId: string) {
    setQualifiedGroups((s) => {
      const next = new Set(s)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  function saveGroup(group: GroupData) {
    const standings = group.teams
      .map((t) => ({ groupId: group.id, teamId: t.teamId, position: parseInt(positions[group.id][t.teamId] || "0", 10) }))
      .filter((s) => s.position >= 1 && s.position <= 4)

    if (standings.length !== group.teams.length) {
      setResults((r) => ({ ...r, [group.id]: { ok: false, message: "Set all 4 positions (1–4) before saving." } }))
      return
    }
    const vals = standings.map((s) => s.position).sort()
    if (JSON.stringify(vals) !== "[1,2,3,4]") {
      setResults((r) => ({ ...r, [group.id]: { ok: false, message: "Positions must be 1, 2, 3, 4 — no duplicates." } }))
      return
    }

    startTransition(async () => {
      setResults((r) => ({ ...r, [group.id]: null }))
      const r = await saveGroupStandings(standings)
      setResults((r2) => ({ ...r2, [group.id]: r }))
    })
  }

  function scoreStandings() {
    startTransition(async () => {
      setResults((r) => ({ ...r, _scoreStandings: null }))
      const r = await calculateGroupStandingPoints()
      setResults((r2) => ({ ...r2, _scoreStandings: r }))
    })
  }

  function saveQualifiers() {
    startTransition(async () => {
      setResults((r) => ({ ...r, _qualifiers: null }))
      const r = await saveThirdPlaceQualifiers([...qualifiedGroups])
      setResults((r2) => ({ ...r2, _qualifiers: r }))
    })
  }

  function scoreThirdPlace() {
    startTransition(async () => {
      setResults((r) => ({ ...r, _scoreThird: null }))
      const r = await calculateThirdPlacePoints()
      setResults((r2) => ({ ...r2, _scoreThird: r }))
    })
  }

  if (groups.length === 0) return null

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <List className="w-4 h-4 text-[#3CAC3B]" />
        Group Final Standings
      </h2>
      <p className="text-[#D1D4D1]/60 text-sm">
        Enter each group's final standings, then calculate points. Run <strong className="text-white">Recalculate Scores</strong> after to update totals.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.id} className="bg-[#0D1333] border-[#1E2B6E]">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">Group {group.letter}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.teams.map((team) => (
                <div key={team.teamId} className="flex items-center gap-2">
                  <select
                    value={positions[group.id][team.teamId]}
                    onChange={(e) => setPos(group.id, team.teamId, e.target.value)}
                    className="w-14 bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-2 py-1 text-sm"
                  >
                    <option value="">—</option>
                    <option value="1">1st</option>
                    <option value="2">2nd</option>
                    <option value="3">3rd</option>
                    <option value="4">4th</option>
                  </select>
                  <span className="text-white text-sm flex-1">{team.name}</span>
                  <span className="text-[#474A4A] text-xs font-mono">{team.code}</span>
                </div>
              ))}
              <ResultAlert result={results[group.id] ?? null} />
              <Button
                size="sm"
                onClick={() => saveGroup(group)}
                disabled={isPending}
                className="w-full bg-[#131D42] hover:bg-[#1A2560] text-[#D1D4D1] border border-[#1E2B6E] text-xs mt-1"
              >
                Save Group {group.letter}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-white font-medium text-sm">Score group standings</p>
            <Badge className="bg-[#131D42] text-[#D1D4D1] border border-[#1E2B6E] text-xs">1pt / correct position</Badge>
          </div>
          <ResultAlert result={results["_scoreStandings"] ?? null} />
          <Button
            size="sm"
            onClick={scoreStandings}
            disabled={isPending}
            className="bg-[#3CAC3B] hover:bg-[#2d9430] text-white"
          >
            Calculate standing points
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          3rd-Place Qualifiers
        </h2>
        <p className="text-[#D1D4D1]/60 text-sm">
          Select the 8 groups whose 3rd-place teams advanced to the Round of 32.
          Requires group standings to be saved first.
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          {groups.map((g) => {
            const thirdTeam = g.teams.find((t) =>
              positions[g.id][t.teamId] === "3" || (t.actualPosition === 3 && !positions[g.id][t.teamId])
            )
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleQualified(g.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                  qualifiedGroups.has(g.id)
                    ? "bg-amber-900/30 border-amber-700/50 text-amber-300"
                    : "bg-[#131D42] border-[#1E2B6E] text-[#D1D4D1]/60 hover:border-[#2A3A8A]"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${qualifiedGroups.has(g.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                <span className="font-medium">Group {g.letter}</span>
                {thirdTeam && <span className="text-xs opacity-70 truncate">{thirdTeam.code}</span>}
              </button>
            )
          })}
        </div>

        <p className="text-[#474A4A] text-xs">{qualifiedGroups.size} / 8 selected</p>

        <div className="flex gap-3 flex-wrap">
          <div>
            <ResultAlert result={results["_qualifiers"] ?? null} />
            <Button
              size="sm"
              onClick={saveQualifiers}
              disabled={isPending}
              className="bg-amber-700 hover:bg-amber-600 text-white"
            >
              Save 3rd-place qualifiers
            </Button>
          </div>
          <div>
            <ResultAlert result={results["_scoreThird"] ?? null} />
            <Button
              size="sm"
              onClick={scoreThirdPlace}
              disabled={isPending}
              className="bg-[#131D42] hover:bg-[#1A2560] text-[#D1D4D1] border border-[#1E2B6E]"
            >
              Calculate 3rd-place points
            </Button>
          </div>
        </div>
      </section>
    </section>
  )
}

// ─── Users panel ─────────────────────────────────────────────────────────────

export type UserRow = {
  id: string
  displayName: string
  email: string
  role: string
  createdAt: Date
  hasPrediction: boolean
  predictionComplete: boolean
  joinedLeague: boolean
  createdLeague: boolean
}

function Tick({ yes }: { yes: boolean }) {
  return yes
    ? <CheckCircle2 className="w-4 h-4 text-[#3CAC3B] mx-auto" />
    : <Minus className="w-4 h-4 text-[#474A4A] mx-auto" />
}

function UsersPanel({ users }: { users: UserRow[] }) {
  const withPrediction = users.filter((u) => u.hasPrediction).length
  const completed      = users.filter((u) => u.predictionComplete).length
  const inLeague       = users.filter((u) => u.joinedLeague).length

  return (
    <section className="space-y-4">
      <h2 className="text-white font-semibold text-lg flex items-center gap-2">
        <Users className="w-4 h-4 text-[#2A398D]" />
        All Users
      </h2>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Registered",   value: users.length },
          { label: "Started",      value: withPrediction },
          { label: "Completed",    value: completed },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0D1333] border border-[#1E2B6E] rounded-lg p-3 text-center">
            <p className="text-white font-bold text-xl tabular-nums">{value}</p>
            <p className="text-[#D1D4D1]/60 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "In a league",    value: inLeague },
          { label: "Created league", value: users.filter((u) => u.createdLeague).length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[#0D1333] border border-[#1E2B6E] rounded-lg p-3 text-center">
            <p className="text-white font-bold text-xl tabular-nums">{value}</p>
            <p className="text-[#D1D4D1]/60 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[#1E2B6E]">
                {["Name", "Email", "Prediction", "Completed", "In League", "Created League"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[#D1D4D1]/60 text-xs font-medium first:rounded-tl-xl last:rounded-tr-xl">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={`border-b border-[#1E2B6E]/50 last:border-0 ${i % 2 === 0 ? "" : "bg-[#131D42]/30"}`}>
                  <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">{u.displayName}</td>
                  <td className="px-4 py-2.5 text-[#D1D4D1]/70 whitespace-nowrap">{u.email}</td>
                  <td className="px-4 py-2.5 text-center"><Tick yes={u.hasPrediction} /></td>
                  <td className="px-4 py-2.5 text-center"><Tick yes={u.predictionComplete} /></td>
                  <td className="px-4 py-2.5 text-center"><Tick yes={u.joinedLeague} /></td>
                  <td className="px-4 py-2.5 text-center"><Tick yes={u.createdLeague} /></td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[#474A4A] text-sm">No users yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function AdminPanels({
  matches,
  matchdays,
  koReminderStatus,
  tournamentDates,
  groups,
  cronActivity,
  users,
}: {
  matches: MatchRow[]
  matchdays: MatchdayStatus[]
  koReminderStatus: KOReminderStatus
  tournamentDates: TournamentDates | null
  groups: GroupData[]
  cronActivity: CronActivity
  users: UserRow[]
}) {
  return (
    <div className="p-8 max-w-2xl space-y-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Admin Console</h1>
          <p className="text-[#D1D4D1]/60 text-sm">Manage data, scores, rankings, and emails.</p>
        </div>
        <HowToGuide variant="admin" />
      </div>

      <CronActivityPanel activity={cronActivity} />

      <UsersPanel users={users} />
      <SyncPanel />
      <TournamentDatesPanel dates={tournamentDates} />
      <ScoreEditorPanel matches={matches} />
      <RecalculatePanel />
      <GroupStandingsPanel groups={groups} />
      <KOReminderPanel status={koReminderStatus} />
      <EmailPanel matchdays={matchdays} />

      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardHeader>
          <CardTitle className="text-white text-base">Workflow guide</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-[#D1D4D1]/60 space-y-2">
          <p><span className="text-white">Before the tournament:</span> Run Sync Everything once to seed teams and matches.</p>
          <p><span className="text-white">After each match day:</span> Run Sync Matches — if scores don't appear, use Manual Score Entry, then Recalculate Scores, then Send Emails.</p>
          <p><span className="text-white">After group stage:</span> Run Sync Everything to resolve KO bracket placeholders with real teams. Enter final standings → Calculate standing points → Mark 3rd-place qualifiers → Calculate 3rd-place points → Recalculate Scores.</p>
          <p><span className="text-white">Score correction:</span> Update the score, Recalculate Scores, then Force Resend the email for that matchday.</p>
        </CardContent>
      </Card>
    </div>
  )
}
