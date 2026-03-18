import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface SubtaskItem {
  id: string
  title: string
  completed: boolean
}

interface SubtaskRowProps {
  item: SubtaskItem
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

function SubtaskRow({ item, onToggle, onDelete }: SubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5 py-0.5 group">
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-slate-300 cursor-grab hover:text-slate-500 flex-shrink-0 select-none"
      >
        ⠿
      </span>
      <button
        onClick={() => onToggle(item.id)}
        className="w-4 h-4 rounded border border-slate-300 flex-shrink-0 flex items-center justify-center hover:border-blue-400"
      >
        {item.completed && (
          <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </button>
      <span className={`flex-1 text-sm ${item.completed ? 'line-through text-slate-400' : 'text-slate-700'}`}>
        {item.title}
      </span>
      <button
        onClick={() => onDelete(item.id)}
        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}

interface SubtaskListProps {
  items: SubtaskItem[]
  onChange: (items: SubtaskItem[]) => void
}

export default function SubtaskList({ items, onChange }: SubtaskListProps) {
  const [newTitle, setNewTitle] = useState('')
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex(i => i.id === active.id)
      const newIndex = items.findIndex(i => i.id === over.id)
      onChange(arrayMove(items, oldIndex, newIndex))
    }
  }

  function handleToggle(id: string) {
    onChange(items.map(i => i.id === id ? { ...i, completed: !i.completed } : i))
  }

  function handleDelete(id: string) {
    onChange(items.filter(i => i.id !== id))
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && newTitle.trim()) {
      onChange([...items, { id: crypto.randomUUID(), title: newTitle.trim(), completed: false }])
      setNewTitle('')
    }
  }

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <SubtaskRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} />
          ))}
        </SortableContext>
      </DndContext>

      <input
        value={newTitle}
        onChange={e => setNewTitle(e.target.value)}
        onKeyDown={handleAddKeyDown}
        placeholder="Add subtask (press Enter)"
        className="w-full text-sm border border-dashed border-slate-300 rounded px-2 py-1 mt-1 focus:outline-none focus:border-blue-400 focus:ring-0 bg-transparent placeholder:text-slate-400"
      />
    </div>
  )
}
