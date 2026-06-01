"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const registerSchema = z.object({
  displayName: z.string().min(2).max(30),
  email: z.string().email(),
  password: z.string().min(8),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type AuthState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  success?: boolean
  warning?: string
}

export async function register(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { displayName, email, password } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  })

  if (error) return { error: error.message }

  // Supabase returns the existing user with empty identities for duplicate emails
  if (!data.user || data.user.identities?.length === 0) {
    return { fieldErrors: { email: ["An account with this email already exists"] } }
  }

  // Supabase accepted the signup, so any existing Prisma record with this email
  // is an orphan left over from a previously deleted Supabase user — remove it
  // before creating the new one.
  await prisma.user.deleteMany({ where: { email, NOT: { id: data.user.id } } })

  try {
    await prisma.user.create({
      data: { id: data.user.id, email, displayName, role: "PLAYER" },
    })
  } catch {
    return { fieldErrors: { email: ["An account with this email already exists"] } }
  }

  // session is null when Supabase requires email confirmation — don't redirect to dashboard yet
  if (!data.session) return { success: true }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function login(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    if (error.message === "Email not confirmed") {
      return { warning: "Please check your inbox and click the confirmation link before signing in." }
    }
    return { error: "Invalid email or password" }
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function loginWithGoogle(_formData: FormData): Promise<void> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })

  if (error) redirect("/login?error=oauth_failed")
  if (data.url) redirect(data.url)
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState & { success?: boolean }> {
  const email = z.string().email().safeParse(formData.get("email"))
  if (!email.success) return { fieldErrors: { email: ["Please enter a valid email address"] } }

  const supabase = await createClient()
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`

  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo })

  if (error) return { error: error.message }
  return { success: true }
}

export async function updatePassword(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = formData.get("password") as string
  const confirm = formData.get("confirmPassword") as string

  if (!password || password.length < 8) {
    return { fieldErrors: { password: ["Password must be at least 8 characters"] } }
  }
  if (password !== confirm) {
    return { fieldErrors: { confirmPassword: ["Passwords do not match"] } }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}
