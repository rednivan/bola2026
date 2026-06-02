import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/dashboard"

  const supabase = await createClient()
  let user = null
  let authError = null

  if (code) {
    // PKCE flow — used by Google OAuth and password reset
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    user = data.user
    authError = error
  } else if (token_hash && type) {
    // OTP flow — used by email confirmation and magic links
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
    user = data.user
    authError = error
  }

  if (!authError && user) {
    // Upsert profile — handles first email confirmation, OAuth login, and returning users
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email!,
        displayName:
          user.user_metadata?.full_name ??
          user.email!.split("@")[0],
        avatarUrl: user.user_metadata?.avatar_url ?? null,
        role: "PLAYER",
      },
    })

    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
