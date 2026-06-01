"use client"

import { useActionState } from "react"
import { createPrediction } from "@/lib/actions/predictions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Trophy } from "lucide-react"

export default function NewPredictionPage() {
  const [state, action, pending] = useActionState(createPrediction, {})

  return (
    <div className="p-6 lg:p-8 flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md bg-[#0D1333] border-[#1E2B6E] shadow-2xl shadow-[#2A398D]/10">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-[#E61D25] flex items-center justify-center shadow-lg shadow-[#E61D25]/30">
              <Trophy className="w-7 h-7 text-white" />
            </div>
          </div>
          <CardTitle className="text-white text-xl font-bold">Create Your Prediction</CardTitle>
          <p className="text-[#D1D4D1]/60 text-sm mt-1">
            Name your prediction — you can join leagues with it later.
          </p>
        </CardHeader>
        <CardContent>
          {state?.error && (
            <p className="text-sm text-white bg-[#E61D25]/20 border border-[#E61D25]/50 px-3 py-2 rounded-md mb-4">
              {state.error}
            </p>
          )}
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#D1D4D1]">Prediction name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g. My Bold Picks"
                maxLength={50}
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold">
              {pending ? "Creating…" : "Start predicting →"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
