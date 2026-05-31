import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncMatchesFromApi } from "@/lib/sync"
import { recalculateAllScores } from "@/lib/scoring"

const JOB = "sync-and-score"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const syncMessage = await syncMatchesFromApi()
    const { predictions, leagues } = await recalculateAllScores()
    const message = `${syncMessage} · recalculated ${predictions} predictions across ${leagues} leagues`

    await prisma.cronLog.create({ data: { job: JOB, ok: true, message } })

    return NextResponse.json({ ok: true, sync: syncMessage, recalculated: { predictions, leagues } })
  } catch (e) {
    const message = (e as Error).message
    await prisma.cronLog.create({ data: { job: JOB, ok: false, message } }).catch(() => {})
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
