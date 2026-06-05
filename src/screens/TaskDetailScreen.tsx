import React, { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import DateTimePicker from '@react-native-community/datetimepicker'
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
type Friend = { id: string; username: string }

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
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [notYetLoading, setNotYetLoading] = useState(false)

  // Re-request form state
  const [showReRequest, setShowReRequest] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null)
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 3600_000))
  const [showPicker, setShowPicker] = useState(false)
  const [sending, setSending] = useState(false)

  async function fetchData() {
    if (!user) return
    const [taskRes, requestRes, friendRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase
        .from('reminder_requests')
        .select('id, status, scheduled_at, repeat_count, reminders_sent, interval_minutes, assignee:users!reminder_requests_assignee_id_fkey(id, username)')
        .eq('task_id', taskId)
        .in('status', ['pending', 'accepted', 'sent'])
        .order('created_at', { ascending: true }),
      supabase
        .from('friendships')
        .select('requester:users!friendships_requester_id_fkey(id,username), addressee:users!friendships_addressee_id_fkey(id,username)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ])
    setTask(taskRes.data)
    setActiveRequests((requestRes.data ?? []) as unknown as ActiveRequest[])
    const raw = (friendRes.data ?? []) as unknown as Array<{ requester: Friend; addressee: Friend }>
    setFriends(raw.map(f => f.requester.id === user.id ? f.addressee : f.requester))
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [taskId, user]))

  async function addPoints(userId: string, amount: number) {
    const { data } = await supabase.from('users').select('points').eq('id', userId).single()
    await supabase.from('users').update({ points: (data?.points ?? 0) + amount }).eq('id', userId)
  }

  async function markDone() {
    if (!task) return
    setMarking(true)

    const allRequests = activeRequests.filter(r => r.status !== 'rejected')
    const totalCommitted = allRequests.reduce((sum, r) => sum + (r.repeat_count ?? 1), 0)
    const totalSent = allRequests.reduce((sum, r) => sum + (r.reminders_sent ?? 0), 0)
    const ownerPoints = Math.max(1, totalCommitted - totalSent + 1)

    await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
    await supabase
      .from('reminder_requests')
      .update({ status: 'cancelled' })
      .eq('task_id', task.id)
      .in('status', ['pending', 'accepted'])

    // Add points directly — avoids RPC version mismatch issues
    await addPoints(user!.id, ownerPoints)

    await Promise.all(allRequests.map(async (req) => {
      if (!req.assignee) return
      const friendPoints = req.reminders_sent ?? 0
      if (friendPoints > 0) {
        await addPoints(req.assignee.id, friendPoints)
      }
      await supabase.from('notifications').insert({
        recipient_id: req.assignee.id,
        type: 'task_done',
        payload: { task_title: task.title, owner_username: username, points_earned: String(friendPoints) },
      })
    }))

    await refreshProfile()
    setMarking(false)
    fetchData()
  }

  async function markNotYet() {
    if (!task) return
    setNotYetLoading(true)
    await supabase.from('tasks').update({ status: 'open' }).eq('id', task.id)
    setNotYetLoading(false)
    setShowReRequest(true)
    fetchData()
  }

  async function sendReRequest() {
    if (!selectedFriend || !task) return
    setSending(true)
    const { data: request } = await supabase
      .from('reminder_requests')
      .insert({
        task_id: task.id,
        requester_id: user!.id,
        assignee_id: selectedFriend.id,
        scheduled_at: scheduledAt.toISOString(),
        repeat_count: 1,
        interval_minutes: 60,
        notification_type: 'standard',
      })
      .select()
      .single()

    if (request) {
      await supabase.from('notifications').insert({
        recipient_id: selectedFriend.id,
        type: 'reminder_request',
        payload: { task_id: task.id, task_title: task.title, request_id: request.id, from_username: username },
      })
    }
    setSending(false)
    setShowReRequest(false)
    setSelectedFriend(null)
    fetchData()
  }

  if (loading || !task) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  const s = statusStyle[task.status] ?? statusStyle.open
  const isReminded = task.status === 'reminded'
  const remindedRequest = activeRequests.find(r => r.status === 'sent' && (r.reminders_sent ?? 0) > 0)
  const pendingOrAccepted = activeRequests.filter(r => ['pending', 'accepted'].includes(r.status))

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

      {/* Reminded — two options */}
      {isReminded && (
        <View className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-5 gap-3">
          <View>
            <Text className="text-orange-700 font-semibold text-sm mb-1">
              🔔 {remindedRequest?.assignee?.username ? `@${remindedRequest.assignee.username}` : 'Your friend'} reminded you!
            </Text>
            <Text className="text-orange-600 text-xs">Did you get this done?</Text>
          </View>
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
          <TouchableOpacity
            onPress={markNotYet}
            disabled={notYetLoading}
            className="bg-white border border-orange-200 rounded-2xl py-4 items-center disabled:opacity-50"
            activeOpacity={0.7}
          >
            {notYetLoading ? <ActivityIndicator color="#f97316" /> : (
              <Text className="text-orange-500 font-semibold text-base">❌ Not yet done</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Active requests list */}
      {pendingOrAccepted.length > 0 && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <Text className="font-semibold text-gray-900 mb-3">Reminder requests</Text>
          {pendingOrAccepted.map(req => (
            <View key={req.id} className="flex-row items-center justify-between py-2 border-b border-gray-50">
              <View>
                <Text className="text-gray-800 font-medium">@{req.assignee?.username ?? '...'}</Text>
                <Text className="text-gray-400 text-xs">
                  {req.repeat_count}× · every {formatInterval(req.interval_minutes)} · {new Date(req.scheduled_at).toLocaleString()}
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

      {/* Re-request form — shown after "Not yet" or when open with no requests */}
      {(showReRequest || (task.status === 'open' && pendingOrAccepted.length === 0)) && task.status !== 'done' && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 gap-4">
          <Text className="font-semibold text-gray-900">
            {showReRequest ? 'Ask someone to remind you again' : 'Ask a friend to remind you'}
          </Text>
          {!friends.length ? (
            <Text className="text-gray-400 text-sm">No friends yet — add some in the Friends tab.</Text>
          ) : (
            <>
              <View className="gap-2">
                {friends.map(f => {
                  const selected = selectedFriend?.id === f.id
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setSelectedFriend(f)}
                      className={`flex-row items-center justify-between px-4 py-3 rounded-2xl border ${selected ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`font-medium ${selected ? 'text-orange-700' : 'text-gray-700'}`}>@{f.username}</Text>
                      {selected && <Text className="text-orange-500">✓</Text>}
                    </TouchableOpacity>
                  )
                })}
              </View>
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                className="border border-gray-200 rounded-2xl px-4 py-3"
                activeOpacity={0.7}
              >
                <Text className="text-gray-700 text-sm">{scheduledAt.toLocaleString()}</Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  value={scheduledAt}
                  mode="datetime"
                  minimumDate={new Date()}
                  onChange={(_, date) => { setShowPicker(false); if (date) setScheduledAt(date) }}
                />
              )}
              <TouchableOpacity
                onPress={sendReRequest}
                disabled={sending || !selectedFriend}
                className="bg-orange-500 rounded-2xl py-4 items-center disabled:opacity-50"
                activeOpacity={0.8}
              >
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <Text className="text-white font-semibold">📨 Send Reminder Request</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Manual complete (open, no reminders) */}
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
