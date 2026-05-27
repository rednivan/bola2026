"use client"

import { useActionState } from "react"
import { updatePassword, type AuthState } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const initialState: AuthState = {}

export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(updatePassword, initialState)

  return (
    <Card className="border-[#1E2B6E] bg-[#0D1333] text-white shadow-2xl shadow-[#2A398D]/20">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 rounded-full bg-[#2A398D] flex items-center justify-center shadow-lg shadow-[#E61D25]/20 border border-[#3D4FA0]">
            <span className="text-3xl">⚽</span>
          </div>
        </div>
        <CardTitle className="text-2xl text-white font-bold tracking-tight">New password</CardTitle>
        <CardDescription className="text-[#D1D4D1]">
          Choose a strong password for your account
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state?.error && (
          <p className="text-sm text-white bg-[#E61D25]/20 border border-[#E61D25]/50 px-3 py-2 rounded-md">
            {state.error}
          </p>
        )}

        <form action={action} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#D1D4D1]">
              New password <span className="text-[#474A4A] text-xs">(min 8 characters)</span>
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
            />
            {state?.fieldErrors?.password && (
              <p className="text-xs text-[#E61D25]">{state.fieldErrors.password[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-[#D1D4D1]">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="••••••••"
              required
              className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
            />
            {state?.fieldErrors?.confirmPassword && (
              <p className="text-xs text-[#E61D25]">{state.fieldErrors.confirmPassword[0]}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold"
          >
            {pending ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
