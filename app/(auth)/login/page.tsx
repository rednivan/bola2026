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
    <Card className="border-green-800 bg-green-950/80 backdrop-blur text-white">
      <CardHeader className="text-center">
        <div className="text-4xl mb-2">⚽</div>
        <CardTitle className="text-2xl text-white">Bola 2026</CardTitle>
        <CardDescription className="text-green-300">
          Sign in to your prediction account
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state?.error && (
          <p className="text-sm text-red-400 bg-red-950/50 px-3 py-2 rounded-md">
            {state.error}
          </p>
        )}

        <form action={action} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-green-200">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="bg-green-900/50 border-green-700 text-white placeholder:text-green-500"
            />
            {state?.fieldErrors?.email && (
              <p className="text-xs text-red-400">{state.fieldErrors.email[0]}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="password" className="text-green-200">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              className="bg-green-900/50 border-green-700 text-white placeholder:text-green-500"
            />
          </div>

          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-green-800" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-green-950 px-2 text-green-500">or</span>
          </div>
        </div>

        <form action={loginWithGoogle}>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-green-700 text-green-200 hover:bg-green-900"
          >
            Continue with Google
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-green-400">
          No account?{" "}
          <Link href="/register" className="text-emerald-400 hover:underline">
            Register here
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
