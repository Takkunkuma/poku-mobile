import React, { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Props = NativeStackScreenProps<DashboardStackParamList, 'TaskDetail'>

type Task = {
  id: string; title: string; description: string; why: string
  difficulty: number; status: string; owner_id: string
}
type ActiveRequest = {
  id: string; status: string; scheduled_at: string
  repeat_count: number; reminders_sent: number; interval_minutes: number | null
  assignee: { id: string; username: string } | null
}

function formatInterval(minutes: number | null): string {
  if (!minutes) return '?'
  if (minutes < 60) return `${minutes}min`
  if (minutes < 1440) return `${minutes / 60}hr`
  return `${minutes / 1440}day`
}

const statusStyle: Record<string, { bg: string; text: string }> = {
  open:     { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  reminded: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  done:     { bg: 'bg-green-100',  text: 'text-green-700'  },
}

export default function TaskDetailScreen({ route }: Props) {
  const { taskId } = route.params
  const { user, username, refreshProfile } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  async function fetchData() {
    if (!user) return
    const [taskRes, requestRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase
        .from('reminder_requests')
        .select('id, status, scheduled_at, repeat_count, reminders_sent, assignee:users!reminder_requests_assignee_id_fkey(id, username)')
        .eq('task_id', taskId)
        .in('status', ['pending', 'accepted', 'sent'])
        .order('created_at', { ascending: true }),
    ])
    setTask(taskRes.data)
    setActiveRequests((requestRes.data ?? []) as unknown as ActiveRequest[])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [taskId, user]))

  async function markDone() {
    if (!task) return
    setMarking(true)

    // Calculate points
    const allRequests = activeRequests.filter(r => r.status !== 'rejected')
    const totalCommitted = allRequests.reduce((sum, r) => sum + (r.repeat_count ?? 1), 0)
    const totalSent = allRequests.reduce((sum, r) => sum + (r.reminders_sent ?? 0), 0)
    const ownerPoints = Math.max(1, totalCommitted - totalSent + 1)

    // Mark task done + cancel all open requests
    await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
    await supabase
      .from('reminder_requests')
      .update({ status: 'cancelled' })
      .eq('task_id', task.id)
      .in('status', ['pending', 'accepted'])

    // Award owner points
    await supabase.rpc('increment_points', { user_id: user!.id, amount: ownerPoints })

    // Award each friend points = their reminders_sent, notify them
    await Promise.all(allRequests.map(async (req) => {
      if (!req.assignee) return
      const friendPoints = req.reminders_sent ?? 0
      if (friendPoints > 0) {
        await supabase.rpc('increment_points', { user_id: req.assignee.id, amount: friendPoints })
      }
      await supabase.from('notifications').insert({
        recipient_id: req.assignee.id,
        type: 'task_done',
        payload: {
          task_title: task.title,
          owner_username: username,
          points_earned: String(friendPoints),
        },
      })
    }))

    await refreshProfile()
    setMarking(false)
    fetchData()
  }

  if (loading || !task) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  const s = statusStyle[task.status] ?? statusStyle.open
  const isReminded = task.status === 'reminded'
  const remindedRequest = activeRequests.find(r => r.status === 'sent' && (r.reminders_sent ?? 0) > 0)
  const pendingOrAccepted = activeRequests.filter(r => ['pending', 'accepted'].includes(r.status))
  const canSendMore = task.status !== 'done' && pendingOrAccepted.length === 0

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      {/* Task card */}
      <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <View className="flex-row items-start justify-between mb-3">
          <Text className="text-xl font-bold text-gray-900 flex-1 pr-2">{task.title}</Text>
          <View className={`rounded-full px-2 py-1 ${s.bg}`}>
            <Text className={`text-xs font-medium ${s.text}`}>{task.status}</Text>
          </View>
        </View>
        {task.description ? <Text className="text-gray-600 text-sm mb-2">{task.description}</Text> : null}
        {task.why ? (
          <View className="bg-orange-50 rounded-2xl px-4 py-3 mb-2">
            <Text className="text-orange-700 text-sm">💡 <Text className="font-bold">Why:</Text> {task.why}</Text>
          </View>
        ) : null}
        <Text className="text-gray-400 text-xs">Difficulty: {'⚡'.repeat(task.difficulty)}</Text>
      </View>

      {/* Done */}
      {task.status === 'done' && (
        <View className="bg-green-50 border border-green-200 rounded-2xl p-6 items-center">
          <Text className="text-3xl mb-2">🎉</Text>
          <Text className="font-semibold text-green-700 text-center">Task complete! Points awarded.</Text>
        </View>
      )}

      {/* Reminded banner */}
      {isReminded && (
        <View className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-5">
          <Text className="text-orange-700 font-semibold text-sm mb-1">
            🔔 {remindedRequest?.assignee?.username ? `@${remindedRequest.assignee.username}` : 'Your friend'} reminded you!
          </Text>
          <Text className="text-orange-600 text-xs mb-4">Mark complete to earn points for everyone.</Text>
          <TouchableOpacity
            onPress={markDone}
            disabled={marking}
            className="bg-green-500 rounded-2xl py-4 items-center disabled:opacity-50"
            activeOpacity={0.8}
          >
            {marking ? <ActivityIndicator color="#fff" /> : (
              <Text className="text-white font-bold text-base">✅ Yes, I completed this!</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Active requests — show each friend's status */}
      {pendingOrAccepted.length > 0 && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <Text className="font-semibold text-gray-900 mb-3">Reminder requests</Text>
          {pendingOrAccepted.map(req => (
            <View key={req.id} className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <View>
                <Text className="text-gray-800 font-medium">@{req.assignee?.username ?? '...'}</Text>
                <Text className="text-gray-400 text-xs">
                  {req.repeat_count}× · every {formatInterval(req.interval_minutes)} · starts {new Date(req.scheduled_at).toLocaleString()}
                </Text>
              </View>
              <View className={`rounded-full px-2 py-0.5 ${req.status === 'accepted' ? 'bg-blue-100' : 'bg-yellow-100'}`}>
                <Text className={`text-xs font-medium ${req.status === 'accepted' ? 'text-blue-700' : 'text-yellow-700'}`}>
                  {req.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Mark done manually (open status, no active reminder) */}
      {task.status === 'open' && (
        <TouchableOpacity
          onPress={markDone}
          disabled={marking}
          className="border border-gray-200 bg-white rounded-2xl py-4 items-center disabled:opacity-50"
          activeOpacity={0.7}
        >
          {marking ? <ActivityIndicator color="#6b7280" /> : (
            <Text className="text-gray-500 text-sm font-medium">Mark as complete</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}
