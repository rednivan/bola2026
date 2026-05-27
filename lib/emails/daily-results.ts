import { transporter, FROM } from "@/lib/mailer"
import { prisma } from "@/lib/prisma"

type RecentMatch = {
  homeTeam: { name: string } | null
  awayTeam: { name: string } | null
  homeTeamPlaceholder: string | null
  awayTeamPlaceholder: string | null
  homeScore: number | null
  awayScore: number | null
  kickoff: Date
  stage: string
  group: { letter: string } | null
}

type UpcomingMatch = RecentMatch

type Prediction = {
  name: string
  status: string
  matchPredictions: { pointsEarned: number | null }[]
}

function matchRow(m: RecentMatch) {
  const home = m.homeTeam?.name ?? m.homeTeamPlaceholder ?? "TBD"
  const away = m.awayTeam?.name ?? m.awayTeamPlaceholder ?? "TBD"
  const label = m.group ? `Group ${m.group.letter}` : m.stage
  const kickoff = m.kickoff.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return `
    <tr>
      <td style="padding:8px 12px;color:#9ca3af;font-size:12px;white-space:nowrap">${label} · ${kickoff}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600">${home}</td>
      <td style="padding:8px 12px;text-align:center;font-size:18px;font-weight:700;color:#E61D25">${m.homeScore ?? "–"} – ${m.awayScore ?? "–"}</td>
      <td style="padding:8px 12px;font-weight:600">${away}</td>
    </tr>`
}

function upcomingRow(m: UpcomingMatch) {
  const home = m.homeTeam?.name ?? m.homeTeamPlaceholder ?? "TBD"
  const away = m.awayTeam?.name ?? m.awayTeamPlaceholder ?? "TBD"
  const label = m.group ? `Group ${m.group.letter}` : m.stage
  const kickoff = m.kickoff.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  return `
    <tr>
      <td style="padding:8px 12px;color:#9ca3af;font-size:12px;white-space:nowrap">${label}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:500">${home}</td>
      <td style="padding:8px 12px;text-align:center;color:#6b7280;font-size:12px">${kickoff}</td>
      <td style="padding:8px 12px;font-weight:500">${away}</td>
    </tr>`
}

function predictionRow(p: Prediction) {
  const total = p.matchPredictions.reduce((sum, mp) => sum + (mp.pointsEarned ?? 0), 0)
  return `
    <tr>
      <td style="padding:8px 12px;font-weight:500">${p.name}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:#3CAC3B;font-size:18px">${total}</td>
      <td style="padding:8px 12px;text-align:center;color:#9ca3af;font-size:12px">${p.status.replace("_", " ")}</td>
    </tr>`
}

function buildHtml(
  recentMatches: RecentMatch[],
  upcomingMatches: UpcomingMatch[],
  predictions: Prediction[],
  appUrl: string,
) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  })

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0D1333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#ffffff">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">

    <div style="text-align:center;padding:32px 0 24px">
      <div style="display:inline-block;background:#E61D25;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;font-size:24px;margin-bottom:12px">⚽</div>
      <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px">Bola 2026</h1>
      <p style="margin:4px 0 0;color:#9ca3af;font-size:14px">Daily Results · ${today}</p>
    </div>

    ${recentMatches.length > 0 ? `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1E2B6E">
        <h2 style="margin:0;font-size:15px;font-weight:600">Recent Results</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${recentMatches.map(matchRow).join("")}</tbody>
      </table>
    </div>` : `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;color:#9ca3af">
      No match results yet — check back after kick-off!
    </div>`}

    ${predictions.length > 0 ? `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1E2B6E">
        <h2 style="margin:0;font-size:15px;font-weight:600">My Predictions</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${predictions.map(predictionRow).join("")}</tbody>
      </table>
    </div>` : ""}

    ${upcomingMatches.length > 0 ? `
    <div style="background:#131D42;border:1px solid #1E2B6E;border-radius:12px;overflow:hidden;margin-bottom:20px">
      <div style="padding:14px 16px;border-bottom:1px solid #1E2B6E">
        <h2 style="margin:0;font-size:15px;font-weight:600">Coming Up</h2>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tbody>${upcomingMatches.map(upcomingRow).join("")}</tbody>
      </table>
    </div>` : ""}

    <div style="background:#0a1028;border:1px solid #1E2B6E;border-radius:12px;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px">Scoring</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <span style="font-size:12px;color:#d1d5db">Group match: <strong style="color:#ffffff">1 pt</strong></span>
        <span style="font-size:12px;color:#d1d5db">R32: <strong style="color:#ffffff">3 pts</strong></span>
        <span style="font-size:12px;color:#d1d5db">R16: <strong style="color:#ffffff">6 pts</strong></span>
        <span style="font-size:12px;color:#d1d5db">QF: <strong style="color:#ffffff">12 pts</strong></span>
        <span style="font-size:12px;color:#d1d5db">SF: <strong style="color:#ffffff">25 pts</strong></span>
        <span style="font-size:12px;color:#d1d5db">Final: <strong style="color:#E61D25">60 pts</strong></span>
      </div>
    </div>

    <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:24px">
      Bola 2026 · You're receiving this because you have an active prediction.<br>
      <a href="${appUrl}" style="color:#2A398D">Open Bola 2026</a>
    </p>
  </div>
</body>
</html>`
}

export async function sendDailyResults(to: string, userId?: string) {
  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) throw new Error("Tournament not found")

  const [recentMatches, upcomingMatches, predictions] = await Promise.all([
    prisma.match.findMany({
      where: { tournamentId: tournament.id, homeScore: { not: null } },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "desc" },
      take: 6,
    }),

    prisma.match.findMany({
      where: { tournamentId: tournament.id, homeScore: null, homeTeamId: { not: null } },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "asc" },
      take: 6,
    }),

    userId
      ? prisma.prediction.findMany({
          where: {
            tournamentId: tournament.id,
            userId,
            NOT: { name: { startsWith: "test__" } },
          },
          include: { matchPredictions: { select: { pointsEarned: true } } },
          orderBy: { updatedAt: "desc" },
          take: 3,
        })
      : Promise.resolve([]),
  ])

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola2026.com"
  const html = buildHtml(recentMatches, upcomingMatches, predictions, appUrl)
  const dateLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })

  const info = await transporter.sendMail({
    from: FROM,
    to,
    subject: `Bola 2026 — Daily Results · ${dateLabel}`,
    html,
  })

  return info.messageId
}
