"use client"

import { useTransition, useState } from "react"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { saveGroupStandings, type GroupPredictionData } from "@/lib/actions/predictions"
import type { Team, GroupData } from "./prediction-editor"

function SortableTeamRow({ team, position, locked }: { team: Team; position: number; locked: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: team.id, disabled: locked })

  const posColour =
    position === 1 ? "text-yellow-400" :
    position === 2 ? "text-[#D1D4D1]" :
    position === 3 ? "text-amber-500" :
    "text-[#474A4A]"

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors select-none
        ${isDragging
          ? "bg-[#2A398D]/30 border-[#2A398D] shadow-lg z-10"
          : "bg-[#131D42] border-[#1E2B6E] hover:border-[#2A398D]/60"
        }`}
    >
      <span className={`text-xs font-bold w-4 text-center ${posColour}`}>{position}</span>
      <button
        {...attributes}
        {...listeners}
        className={`text-[#474A4A] transition-colors ${locked ? "cursor-not-allowed" : "hover:text-[#D1D4D1] cursor-grab active:cursor-grabbing"}`}
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {team.flagUrl ? (
        <img src={team.flagUrl} alt={team.code} className="w-6 h-4 object-cover rounded-sm shrink-0" />
      ) : (
        <div className="w-6 h-4 bg-[#1E2B6E] rounded-sm shrink-0" />
      )}
      <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">{team.name}</span>
      <span className="text-[#474A4A] text-xs font-mono shrink-0">{team.code}</span>
    </div>
  )
}

function GroupCard({ group, orderedTeams, onReorder, locked }: {
  group: GroupData
  orderedTeams: Team[]
  onReorder: (groupId: string, teams: Team[]) => void
  locked: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = orderedTeams.findIndex((t) => t.id === active.id)
    const newIdx = orderedTeams.findIndex((t) => t.id === over.id)
    onReorder(group.id, arrayMove(orderedTeams, oldIdx, newIdx))
  }

  return (
    <div className="bg-[#0D1333] border border-[#1E2B6E] rounded-xl p-4">
      <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-[#2A398D] flex items-center justify-center text-white text-xs font-bold">
          {group.letter}
        </span>
        Group {group.letter}
      </h3>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedTeams.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {orderedTeams.map((team, i) => (
              <SortableTeamRow key={team.id} team={team} position={i + 1} locked={locked} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

type Props = {
  predictionId: string
  groups: GroupData[]
  groupOrders: Record<string, Team[]>   // controlled by parent
  onReorder: (groupId: string, teams: Team[]) => void
  onSaveSuccess?: () => void
  locked: boolean
}

export function GroupStageEditor({ predictionId, groups, groupOrders, onReorder, onSaveSuccess, locked }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  function handleSave() {
    const payload: GroupPredictionData[] = groups.map((g) => ({
      groupId: g.id,
      teams: (groupOrders[g.id] ?? g.teams).map((team, i) => ({ teamId: team.id, position: i + 1 })),
    }))

    setStatus("saved")
    onSaveSuccess?.()

    startTransition(async () => {
      const result = await saveGroupStandings(predictionId, payload)
      if (!result.ok) { setStatus("error"); setErrorMsg(result.message ?? "Failed to save") }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-white font-bold text-lg">Group Stage Standings</h2>
          <p className="text-[#D1D4D1]/60 text-sm mt-0.5">
            Standings update automatically from your match results. Drag to break ties manually.
          </p>
        </div>

        {!locked && (
          <div className="flex items-center gap-3 shrink-0">
            {status === "saved" && (
              <span className="flex items-center gap-1.5 text-[#3CAC3B] text-sm">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            {status === "error" && (
              <span className="flex items-center gap-1.5 text-[#E61D25] text-sm">
                <AlertCircle className="w-4 h-4" /> {errorMsg}
              </span>
            )}
            <Button onClick={handleSave} disabled={isPending} className="bg-[#E61D25] hover:bg-[#CC1920] text-white">
              {isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                : <><Save className="w-4 h-4 mr-2" /> Save standings</>
              }
            </Button>
          </div>
        )}
        {locked && <Badge className="bg-[#131D42] border border-[#1E2B6E] text-[#D1D4D1]">Locked</Badge>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            orderedTeams={groupOrders[group.id] ?? group.teams}
            onReorder={onReorder}
            locked={locked}
          />
        ))}
      </div>
    </div>
  )
}
