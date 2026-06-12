import { transporter, FROM } from "@/lib/mailer"
import { prisma } from "@/lib/prisma"
import { unsubscribeUrl } from "./unsubscribe"

// ─── HTML helpers ────────────────────────────────────────────────────────────

function matchRow(
  home: string, away: string, homeScore: number | null,
  awayScore: number | null, label: string, kickoff: Date
) {
  const dateStr = kickoff.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return `
    <tr>
      <td style="padding:8px 12px;color:#9ca3af;font-size:12px;white-space:nowrap">${label} · ${dateStr}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">${home}</td>
      <td style="padding:8px 12px;text-align:center;font-size:18px;font-weight:700;color:#E61D25">${homeScore ?? "–"} – ${awayScore ?? "–"}</td>
      <td style="padding:8px 12px;font-weight:600">${away}</td>
    </tr>`
}

function upcomingRow(
  home: string, away: string, label: string, kickoff: Date
) {
  const dateStr = kickoff.toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
  return `
    <tr>
      <td style="padding:8px 12px;color:#9ca3af;font-size:12px;white-space:nowrap">${label}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:500">${home}</td>
      <td style="padding:8px 12px;text-align:center;color:#6b7280;font-size:12px">${dateStr}</td>
      <td style="padding:8px 12px;font-weight:500">${away}</td>
    </tr>`
}

// ─── Types ───────────────────────────────────────────────────────────────────

type LeagueEntry = {
  leagueId: string
  leagueName: string
  rank: number
  members: { name: string; score: number; rank: number }[]
}

type PredictionSummary = {
  name: string
  totalScore: number
  pointsToday: number
  leagues: LeagueEntry[]
}

// ─── Email builder ───────────────────────────────────────────────────────────

function buildHtml(
  matchdayDate: string,
  recentResults: { home: string; away: string; homeScore: number; awayScore: number; label: string; kickoff: Date }[],
  upcomingMatches: { home: string; away: string; label: string; kickoff: Date }[],
  predictions: PredictionSummary[],
  appUrl: string,
  userId: string,
) {
  const dateLabel = new Date(matchdayDate + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })

  const predictionsHtml = predictions.map((p) => {
    const leaguesHtml = p.leagues.map((l) => {
      const rows = l.members.map((m, i) => {
        const isUser = m.rank === l.rank
        return `
          <tr style="${isUser ? "background:#1a2560;" : ""}">
            <td style="padding:6px 12px;color:#9ca3af;font-size:12px;width:32px">${m.rank}</td>
            <td style="padding:6px 12px;font-size:13px;${isUser ? "color:#ffffff;font-weight:600;" : "color:#d1d5db;"}">${m.name}${isUser ? " ★" : ""}</td>
            <td style="padding:6px 12px;text-align:right;font-size:13px;font-weight:600;${isUser ? "color:#3CAC3B;" : "color:#9ca3af;"}">${m.score}</td>
          </tr>`
      }).join("")

      return `
        <div style="margin-top:12px">
          <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">${l.leagueName} · Rank #${l.rank}</p>
          <table style="width:100%;border-collapse:collapse;border:1px solid #1E2B6E;border-radius:8px;overflow:hidden">
            <tbody>${rows}</tbody>
          </table>
          <div style="text-align:right;margin-top:6px">
            <a href="${appUrl}/leagues/${l.leagueId}" style="font-size:12px;color:#2A398D;text-decoration:none">View full table →</a>
          </div>
        </div>`
    }).join("")

    const todayBadge = p.pointsToday > 0
      ? `<span style="margin-left:8px;background:#3CAC3B22;color:#3CAC3B;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid #3CAC3B44">+${p.pointsToday} today</span>`
      : ""

    return `
      <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;padding:16px 20px;margin-bottom:16px">
        <table style="width:100%;border-collapse:collapse;margin-bottom:4px">
          <tr>
            <td style="font-weight:600;font-size:15px">${p.name}</td>
            <td style="text-align:right;font-size:22px;font-weight:700;color:#3CAC3B;white-space:nowrap">${p.totalScore}${todayBadge}</td>
          </tr>
        </table>
        ${leaguesHtml}
      </div>`
  }).join("")

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0D1333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ffffff">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <div style="text-align:center;padding:32px 0 24px">
      <div style="display:inline-block;background:#E61D25;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;margin-bottom:12px">⚽</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">Bola 2026</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:14px">Match Day Results · ${dateLabel}</p>
    </div>

    ${recentResults.length > 0 ? `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1E2B6E">
        <h2 style="margin:0;font-size:15px;font-weight:600">Today's Results</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${recentResults.map((m) => matchRow(m.home, m.away, m.homeScore, m.awayScore, m.label, m.kickoff)).join("")}</tbody>
      </table>
    </div>` : ""}

    ${predictions.length > 0 ? `
    <div style="margin-bottom:20px">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600">My Predictions & Leagues</h2>
      ${predictionsHtml}
    </div>` : ""}

    ${upcomingMatches.length > 0 ? `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1E2B6E">
        <h2 style="margin:0;font-size:15px;font-weight:600">Coming Up</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${upcomingMatches.map((m) => upcomingRow(m.home, m.away, m.label, m.kickoff)).join("")}</tbody>
      </table>
    </div>` : ""}

    <div style="background:#0a1028;border:1px solid #1E2B6E;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Scoring</p>
      <table style="border-collapse:collapse;width:100%">
        <tbody>
          <tr>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Group match</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">1 pt</td>
            <td style="padding:3px 12px 3px 24px;font-size:12px;color:#d1d5db;white-space:nowrap">Round of 32</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">3 pts</td>
            <td style="padding:3px 12px 3px 24px;font-size:12px;color:#d1d5db;white-space:nowrap">Round of 16</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">6 pts</td>
          </tr>
          <tr>
            <td style="padding:3px 12px 3px 0;font-size:12px;color:#d1d5db;white-space:nowrap">Quarter-final</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">12 pts</td>
            <td style="padding:3px 12px 3px 24px;font-size:12px;color:#d1d5db;white-space:nowrap">Semi-final</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#ffffff;white-space:nowrap">25 pts</td>
            <td style="padding:3px 12px 3px 24px;font-size:12px;color:#d1d5db;white-space:nowrap">Final</td>
            <td style="padding:3px 0;font-size:12px;font-weight:700;color:#E61D25;white-space:nowrap">60 pts</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="background:#131D42;border:1px solid #2A398D;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#ffffff">⏰ KO Update Window — don't miss it</p>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">
        Once the group stage ends, a short window opens for you to update your KO bracket with the real qualified teams.
        You'll receive an email when it opens — log in, go to your prediction, and revise your picks before the Round of 32 kicks off.
      </p>
    </div>

    <p style="text-align:center;color:#9ca3af;font-size:13px;font-style:italic;margin-top:24px;margin-bottom:4px">
      "With great appreciation comes great responsibility"
    </p>
    <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:0;margin-bottom:24px">
      Your friendly neighbourhood code-slinger, now with his buddy, Claude-man.
    </p>

    <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:0">
      Bola 2026 · You're receiving this because you have an active prediction.<br>
      <a href="${appUrl}" style="color:#2A398D">Open Bola 2026</a>
      &nbsp;·&nbsp;
      <a href="${unsubscribeUrl(userId, appUrl)}" style="color:#4b5563">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

export async function sendMatchdayEmail(
  to: string,
  userId: string,
  matchday: string,
  tournamentId: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola.wathan.my"

  // Matches on this matchday
  const dayStart = new Date(matchday + "T00:00:00Z")
  const dayEnd   = new Date(matchday + "T23:59:59Z")

  const [todayMatches, upcomingRaw, userPredictions] = await Promise.all([
    prisma.match.findMany({
      where: {
        tournamentId,
        kickoff: { gte: dayStart, lte: dayEnd },
        homeScore: { not: null },
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "asc" },
    }),

    prisma.match.findMany({
      where: {
        tournamentId,
        kickoff: { gt: dayEnd },
        homeTeamId: { not: null },
        homeScore: null,
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "asc" },
      take: 6,
    }),

    prisma.prediction.findMany({
      where: { userId, tournamentId },
      include: {
        matchPredictions: {
          where: {
            match: { kickoff: { gte: dayStart, lte: dayEnd } },
          },
          select: { pointsEarned: true },
        },
        leagueMemberships: {
          include: {
            league: {
              select: { name: true },
            },
            // This membership's own rank is on the record itself
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ])

  // Fetch league tables for all leagues the user is in
  const leagueIds = [
    ...new Set(userPredictions.flatMap((p) => p.leagueMemberships.map((m) => m.leagueId))),
  ]

  const leagueTables = await Promise.all(
    leagueIds.map((leagueId) =>
      prisma.leagueMembership.findMany({
        where: { leagueId },
        include: {
          prediction: { select: { name: true, totalScore: true } },
        },
        orderBy: { currentRank: "asc" },
        take: 5,
      })
    )
  )
  const leagueTableMap = new Map(leagueIds.map((id, i) => [id, leagueTables[i]]))

  // Build prediction summaries
  const predictions: PredictionSummary[] = userPredictions.map((p) => {
    const pointsToday = p.matchPredictions.reduce((s, mp) => s + (mp.pointsEarned ?? 0), 0)

    const leagues: LeagueEntry[] = p.leagueMemberships.map((m) => {
      const table = leagueTableMap.get(m.leagueId) ?? []
      return {
        leagueId: m.leagueId,
        leagueName: m.league.name,
        rank: m.currentRank,
        members: table.map((t) => ({
          name: t.prediction.name,
          score: t.prediction.totalScore,
          rank: t.currentRank,
        })),
      }
    })

    return { name: p.name, totalScore: p.totalScore, pointsToday, leagues }
  })

  // Shape match rows
  const recentResults = todayMatches.map((m) => ({
    home: m.homeTeam?.name ?? m.homeTeamPlaceholder ?? "TBD",
    away: m.awayTeam?.name ?? m.awayTeamPlaceholder ?? "TBD",
    homeScore: m.homeScore!,
    awayScore: m.awayScore!,
    label: m.group ? `Group ${m.group.letter}` : m.stage,
    kickoff: m.kickoff,
  }))

  const upcomingMatches = upcomingRaw.map((m) => ({
    home: m.homeTeam?.name ?? m.homeTeamPlaceholder ?? "TBD",
    away: m.awayTeam?.name ?? m.awayTeamPlaceholder ?? "TBD",
    label: m.group ? `Group ${m.group.letter}` : m.stage,
    kickoff: m.kickoff,
  }))

  const html = buildHtml(matchday, recentResults, upcomingMatches, predictions, appUrl, userId)

  const dateLabel = new Date(matchday + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  })

  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject: `Bola 2026 — Match Day Results · ${dateLabel}`,
    html,
  })

  return info.messageId
}

// Legacy helper kept for scripts/send-test-email.ts compatibility
export async function sendDailyResults(to: string, userId?: string) {
  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) throw new Error("Tournament not found")
  const today = new Date().toISOString().slice(0, 10)
  return sendMatchdayEmail(to, userId ?? "", today, tournament.id)
}
