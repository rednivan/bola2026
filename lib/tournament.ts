import { prisma } from "@/lib/prisma"

// Each deployment of this app is scoped to exactly one tournament — a fresh
// Supabase project gets spun up per World Cup / Euros (see the redeployment
// guide in the project archive). So "the active tournament" is just whichever
// single Tournament row exists in this deployment's database, found by most
// recent year rather than a hardcoded year literal.
export async function getActiveTournament() {
  const tournament = await prisma.tournament.findFirst({ orderBy: { year: "desc" } })
  if (!tournament) {
    throw new Error("No tournament configured — create one from Admin → Tournament Setup")
  }
  return tournament
}

// Null-safe variant for pages that render a "no tournament yet" state
// (e.g. the admin dashboard right after a fresh deploy, before setup).
export async function findActiveTournament() {
  return prisma.tournament.findFirst({ orderBy: { year: "desc" } })
}
