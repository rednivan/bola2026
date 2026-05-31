"use client"

import { HelpCircle, CheckCircle2, Trophy, Users, Star, Clock, Shield, RefreshCw, PenLine, BarChart2, Mail, CalendarDays } from "lucide-react"
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
  variant?: "predictions" | "leagues" | "dashboard" | "admin"
}

const SECTIONS: Record<NonNullable<Props["variant"]>, Section[]> = {
  admin: [
    {
      icon: <CalendarDays className="w-4 h-4 text-[#3CAC3B]" />,
      title: "Before the tournament",
      steps: [
        { heading: "Set tournament dates", body: "Enter three key dates in the Tournament Dates panel: when group picks lock (the opening match), when the KO update window opens (after the last group match), and when KO picks lock (before the Round of 32 kicks off). Set these once and only change them if the official schedule shifts." },
        { heading: "Sync Everything", body: "Run Sync Everything once to seed all teams, flags, groups, and the full match schedule into the database. Users can now create predictions." },
      ],
    },
    {
      icon: <RefreshCw className="w-4 h-4 text-[#E61D25]" />,
      title: "Each match day (group stage)",
      steps: [
        { heading: "Everything runs automatically", body: "A cron syncs match scores and recalculates all points every 2 hours. Thirty minutes later a second cron detects fully-scored match days and sends emails to all users. No daily admin action is needed." },
        { heading: "If scores are wrong or missing: Manual Score Entry", body: "Switch the filter to Pending or Scored, find the match, enter the correct score, and save. For KO matches that finish level, select the winner (pens/AET) from the dropdown that appears. Then run Recalculate Scores to apply the correction immediately without waiting for the next cron cycle." },
      ],
    },
    {
      icon: <BarChart2 className="w-4 h-4 text-[#2A398D]" />,
      title: "After the group stage",
      steps: [
        { heading: "1. Sync Everything", body: "This resolves the KO bracket placeholders (e.g. 'Winner Group A') with the real qualified teams, so users see actual flags and names in their KO bracket update window." },
        { heading: "2. Enter all 12 group final standings", body: "In Group Final Standings, set the official finish positions 1–4 for each group and save each one. Positions must be unique — the form will block duplicates." },
        { heading: "3. Calculate standing points", body: "Click Calculate standing points to award bonus points to users who correctly predicted a team's group finish position." },
        { heading: "4. Mark 3rd-place qualifiers", body: "Select exactly 8 groups whose 3rd-place team advanced to the Round of 32. The 3rd-place team code for each group is shown on the button once standings are saved." },
        { heading: "5. Calculate 3rd-place points", body: "Click Calculate 3rd-place points to award points to users who correctly picked those 8 groups." },
        { heading: "6. Recalculate Scores", body: "Run Recalculate Scores to roll all the new standing and 3rd-place points into each prediction's total score and update league rankings." },
        { heading: "7. Send KO Window Reminder", body: "Send this email once — it tells every user the KO update window is open, links them directly to each of their predictions, and states the deadline. Only send after steps 1–6 are complete so the bracket already shows real teams." },
      ],
    },
    {
      icon: <Trophy className="w-4 h-4 text-yellow-400" />,
      title: "During the knockout stage",
      steps: [
        { heading: "Everything still runs automatically", body: "The same cron schedule continues through the knockout stage — scores sync every 2 hours, points recalculate, and matchday emails go out automatically. KO scoring and joker doubling are handled by the same Recalculate Scores logic. Manual overrides (score entry, force resend) work exactly as during the group stage." },
        { heading: "KO draws need a winner", body: "When you enter a level score for a KO match (e.g. 1–1), a winner dropdown appears. Always select the winning team (pens/AET) — without it no KO points are awarded for that match." },
      ],
    },
    {
      icon: <PenLine className="w-4 h-4 text-amber-400" />,
      title: "Correcting a score",
      steps: [
        { heading: "Update the score in Manual Score Entry", body: "Find the match (use the Scored filter), enter the corrected score, and save." },
        { heading: "Recalculate Scores", body: "This re-scores all affected predictions with the corrected result." },
        { heading: "Force Resend the matchday email", body: "In Matchday Emails, select the affected date, tick Force resend, and send. This re-emails users the corrected results for that day." },
      ],
    },
    {
      icon: <Mail className="w-4 h-4 text-[#2A398D]" />,
      title: "Email rules",
      steps: [
        { heading: "Matchday emails: one per completed day", body: "The dropdown only shows dates where every match has a score. Sending without Force will skip users who already received that day's email — safe to retry if the cron partially failed." },
        { heading: "KO reminder: send exactly once", body: "After all sent, the button disables itself. Use Force resend only if the deadline changed or instructions were corrected." },
        { heading: "Force resend is always safe", body: "Users may get a duplicate email but no data is overwritten. Prefer it over leaving users with wrong information." },
      ],
    },
  ],
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
        { heading: "Save standings separately", body: "Use Save standings after any manual reordering. Every correctly predicted position earns 1 point — all four spots in each group count, not just the top two." },
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
      icon: <Star className="w-4 h-4 text-amber-400 fill-amber-400" />,
      title: "Joker Pick",
      steps: [
        { heading: "One joker per stage — doubles your points", body: "Tap the ★ star on any match row to mark it as your joker. If your joker match prediction is correct, you earn double points for that match. Wrong prediction? No penalty — you just earn 0 as normal." },
        { heading: "You get one joker for the group stage", body: "Pick the one group match you are most confident about. It can be any match across any group." },
        { heading: "Separate jokers for each KO round", body: "In the KO bracket, each round (R32, R16, QF, SF, 3rd Place, Final) has its own joker. Use them wisely — the Final joker is worth 120 pts if correct." },
        { heading: "Change your joker any time before the stage locks", body: "Tap the star again to move your joker to a different match. Tapping the active joker removes it. Your choice saves instantly — no need to hit Save." },
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
    {
      icon: <Clock className="w-4 h-4 text-amber-400" />,
      title: "KO Update Window",
      steps: [
        { heading: "Once the group stage ends, a second window opens", body: "After all group matches are played, the real R32 teams are known. You get a window to revisit your KO bracket and update your picks using the actual qualified teams." },
        { heading: "The site opens on the KO tab automatically", body: "When you visit your prediction during the update window, the KO Bracket tab opens straight away and an amber banner tells you how much time is left." },
        { heading: "Window closes when the knockout stage begins", body: "Once the Round of 32 kicks off, all KO picks are locked for good. You will receive an email reminder when the window opens — don't miss it!" },
      ],
    },
  ],

  leagues: [
    {
      icon: <Users className="w-4 h-4 text-[#3CAC3B]" />,
      title: "Creating a league",
      steps: [
        { heading: "You need a completed prediction first", body: "Only predictions with all four sections finished (Match Results, Standings, Third Place, and KO Bracket) appear in the dropdown. Head to Predictions and finish one before creating or joining a league." },
        { heading: "Choose which prediction to enter", body: "Select the prediction you want to represent you in this league from the dropdown." },
        { heading: "Give your league a name", body: "Up to 40 characters. Tick Make public if you want it to appear in public league listings." },
        { heading: "Invite friends via WhatsApp", body: "After creation the site shows a ready-made invite message with step-by-step instructions for new users. Hit Share on WhatsApp or Copy text to send it." },
        { heading: "Deleting a league", body: "As creator you can delete your league at any time from the My Leagues card. This removes all memberships and cannot be undone." },
      ],
    },
    {
      icon: <CheckCircle2 className="w-4 h-4 text-[#2A398D]" />,
      title: "Joining a league",
      steps: [
        { heading: "Choose which prediction to enter", body: "Select the completed prediction you want to compete with in this league." },
        { heading: "Enter the 6-character code", body: "The code is case-insensitive. Your chosen prediction is linked to the league immediately." },
        { heading: "Leaderboard updates after each match", body: "Rankings are recalculated in real time as results come in. Check back after every match day." },
      ],
    },
  ],

  dashboard: [
    {
      icon: <CheckCircle2 className="w-4 h-4 text-[#3CAC3B]" />,
      title: "Getting started",
      steps: [
        { heading: "Create one or more predictions", body: "Click New prediction, give it a name, and you will be taken to the prediction editor. You can create multiple predictions — each one can be entered into a different league." },
        { heading: "Complete all four sections", body: "Match Results, Group Standings, Third Place, and KO Bracket. The progress bar shows how much is left — aim for 100% before the tournament kicks off." },
        { heading: "Update your KO bracket after the group stage", body: "Once all group matches are played a short update window opens. You will receive an email — log back in, go to your prediction, and revise your KO picks using the real qualified teams before the Round of 32 begins." },
        { heading: "Join or create a league", body: "Head to Leagues to compete against friends. Only completed predictions appear in the league dropdown. Share your join code or enter a friend's code to start a private leaderboard." },
      ],
    },
    {
      icon: <Trophy className="w-4 h-4 text-yellow-400" />,
      title: "Scoring",
      steps: [
        { heading: "Group match result", body: "1 point for each correct 1/X/2 outcome." },
        { heading: "Group standings", body: "1 point for each team you correctly place in their final group position — all four spots count." },
        { heading: "Third place advance", body: "1 point for each of the 8 advancing third-place teams you correctly picked." },
        { heading: "Knockout rounds", body: "R32 = 3 pts · R16 = 6 pts · QF = 12 pts · SF = 25 pts · Final = 60 pts per correct pick." },
        { heading: "Joker pick — doubles your points", body: "Tap the ★ star on any match to set it as your joker. One joker per stage — if that prediction is correct, you earn double points for it." },
      ],
    },
  ],
}

export function HowToGuide({ variant = "dashboard" }: Props) {
  const sections = SECTIONS[variant]
  const isAdmin = variant === "admin"

  return (
    <Dialog>
      <DialogTrigger className="flex items-center gap-1.5 text-[#D1D4D1]/60 hover:text-white hover:bg-[#1E2B6E]/60 text-sm rounded-md px-3 py-1.5 transition-colors">
        {isAdmin ? <Shield className="w-4 h-4" /> : <HelpCircle className="w-4 h-4" />}
        {isAdmin ? "Admin guide" : "How to play"}
      </DialogTrigger>

      <DialogContent className="bg-[#0D1333] border-[#1E2B6E] text-white w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-lg font-bold flex items-center gap-2">
            {isAdmin ? <Shield className="w-5 h-5 text-[#3CAC3B]" /> : <HelpCircle className="w-5 h-5 text-[#E61D25]" />}
            {isAdmin ? "Admin guide" : "How to play"}
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
            {isAdmin
              ? "Always run Recalculate Scores after any data change to keep totals and league rankings in sync."
              : "Predictions lock when each stage of the tournament begins. Make sure all sections are saved before kick-off!"}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
