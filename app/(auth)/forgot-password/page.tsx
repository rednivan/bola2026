"use client"

import { useActionState } from "react"
import Link from "next/link"
import { requestPasswordReset, type AuthState } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

type State = AuthState & { success?: boolean }
const initialState: State = {}

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState)

  if (state?.success) {
    return (
      <Card className="border-[#1E2B6E] bg-[#0D1333] text-white shadow-2xl shadow-[#2A398D]/20">
        <CardHeader className="text-center pb-4">
          <div className="flex justify-center mb-3">
            <div className="w-16 h-16 rounded-full bg-[#3CAC3B]/20 border border-[#3CAC3B]/50 flex items-center justify-center">
              <span className="text-3xl">✉️</span>
            </div>
          </div>
          <CardTitle className="text-xl text-white font-bold">Check your email</CardTitle>
          <CardDescription className="text-[#D1D4D1]">
            If an account exists for that address, you'll receive a password reset link shortly.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center border-t border-[#1E2B6E] pt-4">
          <Link href="/login" className="text-sm text-[#3CAC3B] hover:text-[#4DC94C] underline underline-offset-2">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="border-[#1E2B6E] bg-[#0D1333] text-white shadow-2xl shadow-[#2A398D]/20">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 rounded-full bg-[#2A398D] flex items-center justify-center shadow-lg shadow-[#E61D25]/20 border border-[#3D4FA0]">
            <span className="text-3xl">⚽</span>
          </div>
        </div>
        <CardTitle className="text-2xl text-white font-bold tracking-tight">Reset password</CardTitle>
        <CardDescription className="text-[#D1D4D1]">
          Enter your email and we'll send you a reset link
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
            <Label htmlFor="email" className="text-[#D1D4D1]">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
            />
            {state?.fieldErrors?.email && (
              <p className="text-xs text-[#E61D25]">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold"
          >
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-[#1E2B6E] pt-4">
        <p className="text-sm text-[#D1D4D1]">
          Remembered it?{" "}
          <Link href="/login" className="text-[#3CAC3B] hover:text-[#4DC94C] underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
