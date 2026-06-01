import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCachedUser } from "@/lib/cache"
import { Sidebar } from "@/components/dashboard/sidebar"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect("/login")

  const user = await getCachedUser(session.user.id)
  if (!user) redirect("/login")

  return (
    <div className="flex min-h-screen bg-[#0A0E28]">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
