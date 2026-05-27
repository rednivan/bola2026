"use client"

import { useActionState } from "react"
import { createLeague, joinLeague, type LeagueState } from "@/lib/actions/leagues"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, LogIn, CheckCircle2, AlertCircle } from "lucide-react"

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

export function LeagueActions({ hasPrediction }: { hasPrediction: boolean }) {
  const [createState, createAction, createPending] = useActionState(createLeague, initialState)
  const [joinState, joinAction, joinPending] = useActionState(joinLeague, initialState)

  return (
    <div className="grid gap-6 sm:grid-cols-2">
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

            {!createState.error && !createState.fieldErrors && Object.keys(createState).length === 0 ? null : (
              !createState.error && !createState.fieldErrors && (
                <p className="flex items-center gap-1.5 text-[#3CAC3B] text-sm">
                  <CheckCircle2 className="w-4 h-4" /> League created!
                </p>
              )
            )}

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
