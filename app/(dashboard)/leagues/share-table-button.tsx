"use client"

import { useState } from "react"
import { toPng } from "html-to-image"
import { Share2, Loader2 } from "lucide-react"

type Props = { targetId: string; fileName: string }

// Nodes marked data-share-ignore (e.g. this button itself) are excluded from the captured image.
// html-to-image calls this on every node in the tree, including text nodes, which have no dataset.
function captureFilter(node: HTMLElement) {
  return !node.dataset || !("shareIgnore" in node.dataset)
}

export function ShareTableButton({ targetId, fileName }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    const node = document.getElementById(targetId)
    if (!node) return

    setBusy(true)
    setError(null)
    try {
      const dataUrl = await toPng(node, { backgroundColor: "#0D1333", pixelRatio: 2, filter: captureFilter })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], `${fileName}.png`, { type: "image/png" })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        const link = document.createElement("a")
        link.href = dataUrl
        link.download = `${fileName}.png`
        link.click()
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.error("Failed to generate share image:", e)
        setError("Couldn't generate image — try again")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1" data-share-ignore="true">
      <button
        onClick={handleShare}
        disabled={busy}
        className="flex items-center gap-1.5 bg-[#131D42] hover:bg-[#1A2560] border border-[#1E2B6E] text-[#D1D4D1] text-xs px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
        {busy ? "Generating…" : "Share table"}
      </button>
      {error && <span className="text-[#E61D25] text-xs">{error}</span>}
    </div>
  )
}
