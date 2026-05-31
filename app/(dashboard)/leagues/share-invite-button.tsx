"use client"

import { useState } from "react"
import { MessageCircle, Copy, Check, ChevronDown, ChevronUp } from "lucide-react"

type Props = { joinCode: string; leagueName: string }

export function ShareInviteButton({ joinCode, leagueName }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola.wathan.my"

  const message = [
    `🏆 *Bola 2026 – FIFA World Cup Prediction Game*`,
    ``,
    `I've created a private league called *${leagueName}* — come and compete!`,
    ``,
    `*How to join in 3 steps:*`,
    `1️⃣ Register at ${appUrl}`,
    `2️⃣ Complete your prediction — group match results (1/X/2), group standings, which 3rd-place teams advance, and the full KO bracket through to the champion`,
    `3️⃣ Go to *Leagues*, tap Join a league, and enter code: *${joinCode}*`,
    ``,
    `📌 You need a *fully completed* prediction before you can join a league.`,
    ``,
    `Group picks lock on 11 June when the tournament starts. After the group stage you'll get a short window to update your KO bracket with the real qualified teams. Good luck! ⚽`,
  ].join("\n")

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`

  function copyText() {
    navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-[#D1D4D1]/60 hover:text-white transition-colors py-1"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        Invite friends
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#1E2B6E] pt-3">
          <pre className="text-[#D1D4D1] text-xs whitespace-pre-wrap font-sans leading-relaxed bg-[#0A0E28] border border-[#1E2B6E] rounded-lg p-3">
            {message}
          </pre>
          <div className="flex gap-2 flex-wrap">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#1ebd5a] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Share on WhatsApp
            </a>
            <button
              onClick={copyText}
              className="flex items-center gap-1.5 bg-[#131D42] hover:bg-[#1A2560] border border-[#1E2B6E] text-[#D1D4D1] text-xs px-3 py-2 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#3CAC3B]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy text"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
