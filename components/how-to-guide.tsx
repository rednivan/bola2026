"use client"

import { HelpCircle, CheckCircle2, Trophy, Users, Star } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"

type Step = { heading: string; body: string }

type Section = {
  icon: React.ReactNode
  title: string
  steps: Step[]
}

type Props = {
  variant?: "predictions" | "leagues" | "dashboard"
}

const SECTIONS: Record<NonNullable<Props["variant"]>, Section[]> = {
  predictions: [
    {
      icon: <span className="font-mono font-bold text-[#E61D25]">1 X 2</span>,
      title: "Match Results",
      steps: [
        { heading: "Pick an outcome for every group match", body: "Tap 1 for a home win, X for a draw, or 2 for an away win. Each correct result earns 1 point." },
        { heading: "Standings update live", body: "As you pick results, the Group Standings tab automatically recalculates which teams finish 1st, 2nd, and 3rd in each group — no manual entry needed." },
        { heading: "Save before leaving", body: 'Hit Save results to commit your picks to the database. Unsaved picks are shown as "filled, not saved" in the progress bar above.' },
      ],
    },
    {
      icon: <Trophy className="w-4 h-4 text-yellow-400" />,
      title: "Group Standings",
      steps: [
        { heading: "Auto-calculated from match picks", body: "Teams are sorted by predicted points. If two teams are tied, drag them to set your preferred tiebreaker order." },
        { heading: "Save standings separately", body: "Use Save standings after any manual reordering. Each correct top-2 finish earns bonus points." },
      ],
    },
    {
      icon: <Star className="w-4 h-4 text-amber-500" />,
      title: "Third Place",
      steps: [
        { heading: "Pick exactly 8 groups", body: "In the 2026 format, the 8 best third-place finishers advance to the Round of 32. Select the 8 groups you think will produce advancing third-place teams." },
        { heading: "The team shown is your 3rd-place prediction", body: "It is derived automatically from your Group Standings — the team sitting in position 3 for that group." },
      ],
    },
    {
      icon: <Trophy className="w-4 h-4 text-[#E61D25]" />,
      title: "KO Bracket",
      steps: [
        { heading: "Teams populate from your group predictions", body: "R32 slots are filled using your predicted group qualifiers. Pick a winner in each match — no draws in the knockout stage." },
        { heading: "Winners cascade automatically", body: "Picking an R32 winner immediately fills your R16 slot, then QF, SF, and the Final — all the way to your predicted champion." },
        { heading: "Points increase with each round", body: "R32 = 3 pts · R16 = 6 pts · QF = 12 pts · SF = 25 pts · Final = 60 pts. Getting the later rounds right is where titles are won." },
      ],
    },
  ],

  leagues: [
    {
      icon: <Users className="w-4 h-4 text-[#3CAC3B]" />,
      title: "Creating a league",
      steps: [
        { heading: "You need a prediction first", body: "Head to Predictions and complete at least one section before creating or joining a league." },
        { heading: "Give your league a name", body: "Up to 40 characters. Tick Make public if you want it to appear in public league listings." },
        { heading: "Share the join code", body: "After creation you will see a 6-character join code. Send it to friends and they can join with one click." },
      ],
    },
    {
      icon: <CheckCircle2 className="w-4 h-4 text-[#2A398D]" />,
      title: "Joining a league",
      steps: [
        { heading: "Enter the 6-character code", body: "The code is case-insensitive. Your prediction is linked to the league automatically." },
        { heading: "Leaderboard updates after each match", body: "Rankings are recalculated in real time as results come in. Check back after every match day." },
      ],
    },
  ],

  dashboard: [
    {
      icon: <CheckCircle2 className="w-4 h-4 text-[#3CAC3B]" />,
      title: "Getting started",
      steps: [
        { heading: "Create a prediction", body: "Click New prediction, give it a name, and you will be taken to the prediction editor where you can fill in all four sections." },
        { heading: "Complete all four sections", body: "Match Results, Group Standings, Third Place, and KO Bracket. The progress bar shows how much is left — aim for 100% before the tournament kicks off." },
        { heading: "Join or create a league", body: "Head to Leagues to compete against friends. Share your join code or enter a friend's code to start a private leaderboard." },
      ],
    },
    {
      icon: <Trophy className="w-4 h-4 text-yellow-400" />,
      title: "Scoring",
      steps: [
        { heading: "Group match result", body: "1 point for each correct 1/X/2 outcome." },
        { heading: "Group standings", body: "Bonus points for predicting a team's final position correctly." },
        { heading: "Knockout rounds", body: "R32 = 3 pts · R16 = 6 pts · QF = 12 pts · SF = 25 pts · Final = 60 pts per correct pick." },
        { heading: "Third place advance", body: "Points awarded for each of the 8 third-place teams you correctly predicted would advance." },
      ],
    },
  ],
}

export function HowToGuide({ variant = "dashboard" }: Props) {
  const sections = SECTIONS[variant]

  return (
    <Dialog>
      <DialogTrigger className="flex items-center gap-1.5 text-[#D1D4D1]/60 hover:text-white hover:bg-[#1E2B6E]/60 text-sm rounded-md px-3 py-1.5 transition-colors">
        <HelpCircle className="w-4 h-4" />
        How to play
      </DialogTrigger>

      <DialogContent className="bg-[#0D1333] border-[#1E2B6E] text-white w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[#E61D25]" />
            How to play
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-3">
                {section.icon}
                <h3 className="text-white font-semibold text-sm">{section.title}</h3>
              </div>
              <div className="space-y-3 pl-1">
                {section.steps.map((step) => (
                  <div key={step.heading} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#E61D25] mt-2 shrink-0" />
                    <div>
                      <p className="text-white text-sm font-medium">{step.heading}</p>
                      <p className="text-[#D1D4D1]/60 text-xs mt-0.5 leading-relaxed">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[#474A4A] text-xs border-t border-[#1E2B6E] pt-4">
            Predictions lock when each stage of the tournament begins. Make sure all sections are saved before kick-off!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
