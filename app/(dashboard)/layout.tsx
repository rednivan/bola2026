import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { Sidebar } from "@/components/dashboard/sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) redirect("/login")

  const user = await prisma.user.findUnique({ where: { id: authUser.id } })
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
