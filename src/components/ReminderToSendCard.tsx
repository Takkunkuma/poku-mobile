import React from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { difficultyColor, difficultyTextColor, difficultyLabel } from '@/lib/difficulty'
import { formatDateTime } from '@/lib/datetime'
import { ordinal, formatCountdown, reminderDueAt, duePhase } from '@/lib/countdown'

export type ReminderRequest = {
  id: string
  task_id: string
  status: string
  scheduled_at: string
  requester_id: string
  repeat_count: number
  reminders_sent: number
  notification_type: string
  interval_minutes: number | null
  task: { id: string; title: string; why: string | null; difficulty: number }
  requester: { username: string }
}

type Props = {
  req: ReminderRequest
  now: number
  isLoading: boolean
  onSend: (req: ReminderRequest) => void
}

// A reminder you've accepted and owe to a friend, with a live countdown to the
// next send time. Blue when due, orange once overdue past the grace window.
export default function ReminderToSendCard({ req, now, isLoading, onSend }: Props) {
  const remindersDone = req.reminders_sent ?? 0
  const nextOrdinal = ordinal(remindersDone + 1)

  const dueAt = reminderDueAt(req.scheduled_at, req.interval_minutes, remindersDone)
  const remaining = dueAt - now
  const phase = duePhase(dueAt, now)

  const btn =
    phase === 'due'
      ? { bg: '#3b82f6', fg: '#ffffff', label: `🔔 Send ${nextOrdinal} reminder` }
      : phase === 'overdue'
      ? { bg: '#f97316', fg: '#ffffff', label: `⚠️ Overdue — send ${nextOrdinal} reminder now!` }
      : { bg: '#f3f4f6', fg: '#6b7280', label: `🕐 ${nextOrdinal} reminder in ${formatCountdown(remaining)}` }

  return (
    <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-3">
      <Text className="text-xs text-gray-400 mb-1">remind @{req.requester?.username}</Text>
      <Text className="font-semibold text-gray-900">{req.task?.title}</Text>
      {req.task?.why ? <Text className="text-orange-600 text-xs mt-1">💡 {req.task.why}</Text> : null}

      <View
        className="self-start rounded-full px-2.5 py-0.5 mt-2 mb-1.5"
        style={{ backgroundColor: difficultyColor(req.task?.difficulty ?? 1, 0.15) }}
      >
        <Text className="text-xs font-medium" style={{ color: difficultyTextColor(req.task?.difficulty ?? 1) }}>
          {difficultyLabel(req.task?.difficulty ?? 1)}
        </Text>
      </View>

      <Text className="text-gray-500 text-xs">First reminder: {formatDateTime(req.scheduled_at)}</Text>
      {(req.repeat_count ?? 1) > 1 && (
        <Text className="text-gray-400 text-xs mt-0.5">
          {req.repeat_count}× reminders · {remindersDone} sent so far
        </Text>
      )}

      <TouchableOpacity
        onPress={() => onSend(req)}
        disabled={isLoading}
        className="w-full mt-4 rounded-2xl py-3 items-center"
        style={{ backgroundColor: btn.bg, opacity: isLoading ? 0.5 : 1 }}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color={btn.fg} size="small" />
        ) : (
          <Text className="text-sm font-medium" style={{ color: btn.fg }}>
            {btn.label}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}
