"use client"

import { useActionState, useState } from "react"
import { createLeague, joinLeague, type LeagueState } from "@/lib/actions/leagues"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, LogIn, CheckCircle2, AlertCircle, Copy, Check, MessageCircle } from "lucide-react"

const initialState: LeagueState = {}

function StatusMessage({ state }: { state: LeagueState }) {
  if (state.error) return (
    <p className="flex items-center gap-1.5 text-[#E61D25] text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" /> {state.error}
    </p>
  )
  if (state.fieldErrors) {
    const msgs = Object.values(state.fieldErrors).flat()
    return (
      <p className="flex items-center gap-1.5 text-[#E61D25] text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" /> {msgs[0]}
      </p>
    )
  }
  return null
}

function WhatsAppInvite({ joinCode, leagueName }: { joinCode: string; leagueName: string }) {
  const [copied, setCopied] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola.wathan.my"

  const message = [
    `🏆 *Bola 2026 – FIFA World Cup Prediction Game*`,
    ``,
    `I've created a private prediction league called *${leagueName}* and I want you to join!`,
    ``,
    `*How to join in 3 steps:*`,
    `1️⃣ Register at ${appUrl}`,
    `2️⃣ Create your prediction (pick all 72 match results, group standings & the champion)`,
    `3️⃣ Go to *Leagues* and enter this join code: *${joinCode}*`,
    ``,
    `Predictions lock when the tournament kicks off on 11 June. Good luck! ⚽`,
  ].join("\n")

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`

  function copyText() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="bg-[#0D1F0D] border-[#3CAC3B]/40 col-span-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#3CAC3B]" />
          League created! Invite your friends
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Join code */}
        <div className="flex items-center gap-3">
          <span className="text-[#D1D4D1]/60 text-sm">Join code:</span>
          <span className="text-white font-mono font-bold tracking-[0.3em] text-xl bg-[#131D42] border border-[#1E2B6E] px-3 py-1 rounded-lg">
            {joinCode}
          </span>
        </div>

        {/* Message preview */}
        <div className="bg-[#0A0E28] border border-[#1E2B6E] rounded-xl p-4">
          <p className="text-[#D1D4D1]/60 text-xs mb-2 uppercase tracking-wide font-medium">Invite message</p>
          <pre className="text-[#D1D4D1] text-sm whitespace-pre-wrap font-sans leading-relaxed">{message}</pre>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 flex-wrap">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-[#25D366] hover:bg-[#1ebd5a] text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Share on WhatsApp
          </a>
          <button
            onClick={copyText}
            className="flex items-center gap-2 bg-[#131D42] hover:bg-[#1A2560] border border-[#1E2B6E] text-[#D1D4D1] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-[#3CAC3B]" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy text"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

type Prediction = { id: string; name: string }

export function LeagueActions({ predictions }: { predictions: Prediction[] }) {
  const hasPrediction = predictions.length > 0
  const [createState, createAction, createPending] = useActionState(createLeague, initialState)
  const [joinState, joinAction, joinPending] = useActionState(joinLeague, initialState)

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {createState.joinCode && createState.leagueName && (
        <WhatsAppInvite joinCode={createState.joinCode} leagueName={createState.leagueName} />
      )}
      {/* Create league */}
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-[#E61D25]" />
            Create a league
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-prediction" className="text-[#D1D4D1] text-sm">Prediction to enter</Label>
              <select
                id="create-prediction"
                name="predictionId"
                disabled={!hasPrediction || createPending}
                className="w-full bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-3 py-2 text-sm focus:border-[#E61D25] focus:outline-none disabled:opacity-50"
              >
                {predictions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-name" className="text-[#D1D4D1] text-sm">League name</Label>
              <Input
                id="create-name"
                name="name"
                placeholder="e.g. Office Champions"
                maxLength={40}
                disabled={!hasPrediction || createPending}
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
              />
              {createState.fieldErrors?.name && (
                <p className="text-[#E61D25] text-xs">{createState.fieldErrors.name[0]}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPublic"
                name="isPublic"
                className="rounded border-[#1E2B6E] bg-[#1A2560] text-[#3CAC3B]"
              />
              <Label htmlFor="isPublic" className="text-[#D1D4D1] text-sm cursor-pointer">
                Make league public
              </Label>
            </div>

            <StatusMessage state={createState} />


            <Button
              type="submit"
              disabled={!hasPrediction || createPending}
              className="w-full bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold disabled:opacity-40"
            >
              {createPending ? "Creating…" : "Create league"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Join league */}
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <LogIn className="w-4 h-4 text-[#3CAC3B]" />
            Join a league
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={joinAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="join-prediction" className="text-[#D1D4D1] text-sm">Prediction to enter</Label>
              <select
                id="join-prediction"
                name="predictionId"
                disabled={!hasPrediction || joinPending}
                className="w-full bg-[#1A2560] border border-[#1E2B6E] text-white rounded-md px-3 py-2 text-sm focus:border-[#3CAC3B] focus:outline-none disabled:opacity-50"
              >
                {predictions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="join-code" className="text-[#D1D4D1] text-sm">Join code</Label>
              <Input
                id="join-code"
                name="code"
                placeholder="e.g. ABC123"
                maxLength={6}
                disabled={!hasPrediction || joinPending}
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#3CAC3B] font-mono uppercase tracking-widest"
              />
              {joinState.fieldErrors?.code && (
                <p className="text-[#E61D25] text-xs">{joinState.fieldErrors.code[0]}</p>
              )}
            </div>

            <StatusMessage state={joinState} />

            {!joinState.error && !joinState.fieldErrors && Object.keys(joinState).length === 0 ? null : (
              !joinState.error && !joinState.fieldErrors && (
                <p className="flex items-center gap-1.5 text-[#3CAC3B] text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Joined!
                </p>
              )
            )}

            <Button
              type="submit"
              disabled={!hasPrediction || joinPending}
              className="w-full bg-[#131D42] hover:bg-[#1A2560] text-[#D1D4D1] border border-[#1E2B6E] disabled:opacity-40"
            >
              {joinPending ? "Joining…" : "Join league"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
