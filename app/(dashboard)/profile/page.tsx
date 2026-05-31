import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { ProfileSettings } from "./profile-settings"

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const user = session.user

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) redirect("/login")

  return (
    <ProfileSettings
      displayName={dbUser.displayName}
      email={dbUser.email}
    />
  )
}
