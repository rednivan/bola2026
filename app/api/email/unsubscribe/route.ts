import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { prisma } from "@/lib/prisma"

function verifyToken(userId: string, token: string): boolean {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? "default-secret"
  const expected = createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32)
  return token === expected
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const userId = searchParams.get("uid")
  const token = searchParams.get("token")

  if (!userId || !token || !verifyToken(userId, token)) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 })
  }

  await prisma.user.update({
    where: { id: userId },
    data: { emailOptOut: true },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola.wathan.my"
  return NextResponse.redirect(`${appUrl}/unsubscribed`)
}
