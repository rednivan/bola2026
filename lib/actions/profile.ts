"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return { user, supabase }
}

const nameSchema = z.string().min(2, "Name must be at least 2 characters").max(40, "Name must be 40 characters or less").trim()

export async function updateDisplayName(
  _prev: { ok?: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { user } = await getAuthUser()
    const parsed = nameSchema.safeParse(formData.get("displayName"))
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" }

    await prisma.user.update({
      where: { id: user.id },
      data: { displayName: parsed.data },
    })

    revalidatePath("/profile")
    revalidatePath("/dashboard")
    return { ok: true, message: "Display name updated." }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function updatePassword(
  _prev: { ok?: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  try {
    const { supabase } = await getAuthUser()
    const password = formData.get("password") as string
    const confirm = formData.get("confirmPassword") as string

    if (!password || password.length < 8) {
      return { ok: false, message: "Password must be at least 8 characters." }
    }
    if (password !== confirm) {
      return { ok: false, message: "Passwords don't match." }
    }

    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, message: error.message }

    return { ok: true, message: "Password updated." }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
