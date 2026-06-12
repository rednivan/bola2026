"use client"

import { useSyncExternalStore } from "react"
import { format } from "date-fns"

const noopSubscribe = () => () => {}

// Shift `date` so that format() — which always reads local-machine time —
// reproduces its UTC representation. Used as the server/pre-hydration
// snapshot, since the viewer's real timezone is only known on the client.
function formatUTC(date: Date, fmt: string): string {
  const shifted = new Date(date.getTime() + date.getTimezoneOffset() * 60000)
  return format(shifted, fmt)
}

// Renders a kickoff time in the viewer's local timezone.
export function LocalDate({ date, fmt }: { date: Date; fmt: string }) {
  const str = useSyncExternalStore(
    noopSubscribe,
    () => format(date, fmt),
    () => formatUTC(date, fmt),
  )
  return <>{str}</>
}
