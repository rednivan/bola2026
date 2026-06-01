"use client"

import { useActionState } from "react"
import Link from "next/link"
import { login, loginWithGoogle, type AuthState } from "@/lib/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

const initialState: AuthState = {}

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, initialState)

  return (
    <Card className="border-[#1E2B6E] bg-[#0D1333] text-white shadow-2xl shadow-[#2A398D]/20">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-3">
          <div className="w-16 h-16 rounded-full bg-[#2A398D] flex items-center justify-center shadow-lg shadow-[#E61D25]/20 border border-[#3D4FA0]">
            <span className="text-3xl">⚽</span>
          </div>
        </div>
        <CardTitle className="text-2xl text-white font-bold tracking-tight">Bola 2026</CardTitle>
        <CardDescription className="text-[#D1D4D1]">
          Sign in to your prediction account
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state?.warning && (
          <p className="text-sm text-amber-200 bg-amber-900/30 border border-amber-600/50 px-3 py-2 rounded-md">
            {state.warning}
          </p>
        )}
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

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#D1D4D1]">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#E61D25]"
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[#E61D25] hover:bg-[#CC1920] text-white font-semibold"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-[#D1D4D1]/60 hover:text-[#3CAC3B] transition-colors">
            Forgot password?
          </Link>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[#1E2B6E]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-[#0D1333] px-2 text-[#474A4A]">or</span>
          </div>
        </div>

        <form action={loginWithGoogle}>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-[#2A398D] text-[#D1D4D1] hover:bg-[#1A2560] hover:text-white"
          >
            Continue with Google
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-[#1E2B6E] pt-4">
        <p className="text-sm text-[#D1D4D1]">
          No account?{" "}
          <Link href="/register" className="text-[#3CAC3B] hover:text-[#4DC94C] underline underline-offset-2">
            Register here
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
