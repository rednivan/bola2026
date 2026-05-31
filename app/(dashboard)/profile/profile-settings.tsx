"use client"

import { useActionState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, UserCircle, Lock } from "lucide-react"
import Link from "next/link"
import { updateDisplayName, updatePassword } from "@/lib/actions/profile"

const idle = { ok: undefined as boolean | undefined, message: "" }

export function ProfileSettings({
  displayName,
  email,
}: {
  displayName: string
  email: string
}) {
  const [nameState, nameAction, namePending] = useActionState(updateDisplayName, idle)
  const [passState, passAction, passPending] = useActionState(updatePassword, idle)

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white max-w-lg">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[#D1D4D1]/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCircle className="w-6 h-6 text-[#3CAC3B]" />
          Profile
        </h1>
        <p className="text-[#D1D4D1]/60 text-sm mt-1">{email}</p>
      </div>

      {/* Display name */}
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base">Display Name</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={nameAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="displayName" className="text-[#D1D4D1] text-sm">Name</Label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={displayName}
                placeholder="Your display name"
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#3CAC3B]"
                maxLength={40}
              />
            </div>

            {nameState.message && (
              <p className={`text-xs ${nameState.ok ? "text-[#3CAC3B]" : "text-red-400"}`}>
                {nameState.message}
              </p>
            )}

            <Button
              type="submit"
              disabled={namePending}
              className="bg-[#3CAC3B] hover:bg-[#2d8f2c] text-white"
            >
              {namePending ? "Saving…" : "Save Name"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="bg-[#0D1333] border-[#1E2B6E]">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={passAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#D1D4D1] text-sm">New Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Min. 8 characters"
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#3CAC3B]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-[#D1D4D1] text-sm">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                className="bg-[#1A2560] border-[#1E2B6E] text-white placeholder:text-[#474A4A] focus:border-[#3CAC3B]"
              />
            </div>

            {passState.message && (
              <p className={`text-xs ${passState.ok ? "text-[#3CAC3B]" : "text-red-400"}`}>
                {passState.message}
              </p>
            )}

            <Button
              type="submit"
              disabled={passPending}
              className="bg-[#1E2B6E] hover:bg-[#2A3A8A] text-white"
            >
              {passPending ? "Updating…" : "Update Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
