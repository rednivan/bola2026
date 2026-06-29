"use client"

import { useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export function CollapsibleCard({
  title,
  icon,
  defaultOpen = false,
  contentClassName = "",
  children,
}: {
  title: ReactNode
  icon?: ReactNode
  defaultOpen?: boolean
  contentClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className="bg-[#0D1333] border-[#1E2B6E]">
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <CardTitle className="text-white text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">{icon}{title}</span>
          <ChevronDown className={`w-4 h-4 text-[#474A4A] transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
        </CardTitle>
      </CardHeader>
      {open && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  )
}
