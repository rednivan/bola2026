import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"

export default async function PredictionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const prediction = await prisma.prediction.findFirst({
    where: { userId: user.id, tournament: { year: 2026 } },
  })

  if (prediction) {
    redirect(`/predictions/${prediction.id}/edit`)
  } else {
    redirect("/predictions/new")
  }
}
