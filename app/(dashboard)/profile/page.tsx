import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { ProfileSettings } from "./profile-settings"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) redirect("/login")

  return (
    <ProfileSettings
      displayName={dbUser.displayName}
      email={dbUser.email}
    />
  )
}
