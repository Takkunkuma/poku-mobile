import React, { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack'
import DateTimePicker from '@react-native-community/datetimepicker'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Props = NativeStackScreenProps<DashboardStackParamList, 'TaskDetail'>
type Nav = NativeStackNavigationProp<DashboardStackParamList>

type Task = {
  id: string; title: string; description: string; why: string
  difficulty: number; status: string; owner_id: string
}
type Friend = { id: string; username: string }
type ActiveRequest = {
  id: string; status: string; scheduled_at: string
  assignee: { username: string } | null
} | null

const statusStyle: Record<string, { bg: string; text: string }> = {
  open:     { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  reminded: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  done:     { bg: 'bg-green-100',  text: 'text-green-700'  },
}

export default function TaskDetailScreen({ route }: Props) {
  const { taskId } = route.params
  const { user, username, refreshProfile } = useAuth()
  const navigation = useNavigation<Nav>()

  const [task, setTask] = useState<Task | null>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [activeRequest, setActiveRequest] = useState<ActiveRequest>(null)
  const [loading, setLoading] = useState(true)

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null)
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 3600_000))
  const [showPicker, setShowPicker] = useState(false)
  const [sending, setSending] = useState(false)
  const [marking, setMarking] = useState(false)

  async function fetchData() {
    if (!user) return
    const [taskRes, requestRes, friendRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase
        .from('reminder_requests')
        .select('id, status, scheduled_at, assignee:users!reminder_requests_assignee_id_fkey(username)')
        .eq('task_id', taskId)
        .in('status', ['pending', 'accepted'])
        .maybeSingle(),
      supabase
        .from('friendships')
        .select('requester:users!friendships_requester_id_fkey(id, username), addressee:users!friendships_addressee_id_fkey(id, username)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ])

    setTask(taskRes.data)
    setActiveRequest(requestRes.data as ActiveRequest)

    const raw = (friendRes.data ?? []) as unknown as Array<{
      requester: { id: string; username: string }
      addressee: { id: string; username: string }
    }>
    setFriends(raw.map(f => f.requester.id === user.id ? f.addressee : f.requester))
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [taskId, user]))

  async function sendRequest() {
    if (!selectedFriend || !user || !task) return
    setSending(true)

    const { data: request, error } = await supabase
      .from('reminder_requests')
      .insert({
        task_id: task.id,
        requester_id: user.id,
        assignee_id: selectedFriend.id,
        scheduled_at: scheduledAt.toISOString(),
      })
      .select()
      .single()

    if (!error && request) {
      await supabase.from('notifications').insert({
        recipient_id: selectedFriend.id,
        type: 'reminder_request',
        payload: { task_id: task.id, task_title: task.title, request_id: request.id, from_username: username },
      })
    }

    setSending(false)
    fetchData()
  }

  async function markDone() {
    if (!task) return
    setMarking(true)
    await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)

    if (activeRequest) {
      const { data: req } = await supabase
        .from('reminder_requests')
        .select('assignee_id, requester_id')
        .eq('id', activeRequest.id)
        .single()

      if (req) {
        await Promise.all([
          supabase.rpc('increment_points', { user_id: req.assignee_id }),
          supabase.rpc('increment_points', { user_id: req.requester_id }),
          supabase.from('notifications').insert({
            recipient_id: req.assignee_id,
            type: 'task_done',
            payload: { task_title: task.title, owner_username: username },
          }),
        ])
        await refreshProfile()
      }
    }

    setMarking(false)
    fetchData()
  }

  if (loading || !task) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  const s = statusStyle[task.status] ?? statusStyle.open
  const isReminded = task.status === 'reminded'
  const canSendRequest = task.status !== 'done' && !activeRequest

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12 }}>
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
          <Text className="font-semibold text-green-700 text-center">Task complete! You both earned +1 point.</Text>
        </View>
      )}

      {/* Reminded */}
      {isReminded && (
        <View className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-5">
          <Text className="text-orange-700 font-semibold text-sm mb-1">
            🔔 @{activeRequest?.assignee?.username ?? 'Your friend'} reminded you!
          </Text>
          <Text className="text-orange-600 text-xs mb-4">Did you get this done? Mark complete to earn points.</Text>
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

      {/* Pending request */}
      {task.status !== 'done' && !isReminded && activeRequest && (
        <View className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <Text className="text-blue-700 text-sm font-medium">
            ⏳ @{activeRequest.assignee?.username} will remind you at{' '}
            {new Date(activeRequest.scheduled_at).toLocaleString()}
          </Text>
        </View>
      )}

      {/* Mark done manually (no reminder needed) */}
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

      {/* Send request form */}
      {canSendRequest && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <Text className="font-semibold text-gray-900 mb-4">Ask a friend to remind you</Text>
          {!friends.length ? (
            <Text className="text-gray-400 text-sm">No friends yet. Add some in the Friends tab.</Text>
          ) : (
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">Choose a friend</Text>
                <View className="gap-2">
                  {friends.map(f => (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setSelectedFriend(f)}
                      className={`flex-row items-center justify-between px-4 py-3 rounded-2xl border ${
                        selectedFriend?.id === f.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white'
                      }`}
                      activeOpacity={0.7}
                    >
                      <Text className="text-gray-800 font-medium">@{f.username}</Text>
                      {selectedFriend?.id === f.id && <Text className="text-orange-500">✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-2">When should they remind you?</Text>
                <TouchableOpacity
                  onPress={() => setShowPicker(true)}
                  className="border border-gray-200 rounded-2xl px-4 py-3"
                  activeOpacity={0.7}
                >
                  <Text className="text-sm text-gray-700">{scheduledAt.toLocaleString()}</Text>
                </TouchableOpacity>
                {showPicker && (
                  <DateTimePicker
                    value={scheduledAt}
                    mode="datetime"
                    minimumDate={new Date()}
                    onChange={(_, date) => { setShowPicker(false); if (date) setScheduledAt(date) }}
                  />
                )}
              </View>

              <TouchableOpacity
                onPress={sendRequest}
                disabled={sending || !selectedFriend}
                className="bg-orange-500 rounded-2xl py-4 items-center disabled:opacity-50"
                activeOpacity={0.8}
              >
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <Text className="text-white font-semibold">📨 Send Reminder Request</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}
