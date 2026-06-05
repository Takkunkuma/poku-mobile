import React, { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, SectionList,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { scheduleLocalNotification } from '@/lib/notifications'

type Request = {
  id: string; status: string; scheduled_at: string; requester_id: string
  task: { id: string; title: string; description: string; why: string; difficulty: number }
  requester: { username: string }
}
type CompletionNotif = {
  id: string; created_at: string
  payload: { task_title: string; owner_username: string }
}

export default function InboxScreen() {
  const { user, username } = useAuth()
  const [requests, setRequests] = useState<Request[]>([])
  const [completions, setCompletions] = useState<CompletionNotif[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetching, setFetching] = useState(true)

  async function fetchData() {
    if (!user) return
    const [reqRes, notifRes] = await Promise.all([
      supabase
        .from('reminder_requests')
        .select('id, status, scheduled_at, requester_id, task:tasks(id,title,description,why,difficulty), requester:users!reminder_requests_requester_id_fkey(username)')
        .eq('assignee_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('id, created_at, payload')
        .eq('recipient_id', user.id)
        .eq('type', 'task_done')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setRequests((reqRes.data ?? []) as unknown as Request[])
    setCompletions((notifRes.data ?? []) as unknown as CompletionNotif[])
    setFetching(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [user]))

  async function respond(requestId: string, status: 'accepted' | 'rejected', requesterId: string, taskTitle: string) {
    setLoading(requestId)
    await supabase.from('reminder_requests').update({ status }).eq('id', requestId)
    await supabase.from('notifications').insert({
      recipient_id: requesterId,
      type: status === 'accepted' ? 'request_accepted' : 'request_rejected',
      payload: { task_title: taskTitle, request_id: requestId },
    })
    setLoading(null)
    fetchData()
  }

  async function sendReminder(requestId: string, requesterId: string, taskTitle: string, taskId: string) {
    setLoading(requestId)
    await supabase.from('reminder_requests').update({ status: 'sent' }).eq('id', requestId)
    await supabase.from('tasks').update({ status: 'reminded' }).eq('id', taskId)
    await supabase.from('notifications').insert({
      recipient_id: requesterId,
      type: 'reminder_sent',
      payload: { task_title: taskTitle, from_user_id: user!.id, from_username: username, task_id: taskId },
    })
    await scheduleLocalNotification('Reminder sent!', `You reminded someone about "${taskTitle}"`)
    setLoading(null)
    fetchData()
  }

  const pending = requests.filter(r => r.status === 'pending')
  const accepted = requests.filter(r => r.status === 'accepted')
  const past = requests.filter(r => ['rejected', 'sent'].includes(r.status))

  if (fetching) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <SectionList
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor="#f97316" />}
      ListHeaderComponent={null}
      ListEmptyComponent={
        <View className="items-center py-16">
          <Text className="text-4xl mb-3">📭</Text>
          <Text className="text-gray-400">No reminder requests yet.</Text>
        </View>
      }
      sections={[
        ...(pending.length ? [{ title: 'Pending', data: pending }] : []),
        ...(accepted.length ? [{ title: 'Accepted — Ready to Remind', data: accepted }] : []),
        ...(past.length ? [{ title: 'Past', data: past }] : []),
        ...(completions.length ? [{ title: '🎉 Completed', data: completions as any }] : []),
      ]}
      keyExtractor={item => item.id}
      renderSectionHeader={({ section }) => (
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-2">{section.title}</Text>
      )}
      renderItem={({ item, section }) => {
        if (section.title === '🎉 Completed') {
          const n = item as unknown as CompletionNotif
          return (
            <View className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-2">
              <Text className="text-green-700 font-semibold text-sm">
                @{n.payload.owner_username} completed "{n.payload.task_title}"!
              </Text>
              <Text className="text-green-500 text-xs mt-0.5">
                You both earned +1 point 🏆 · {new Date(n.created_at).toLocaleString()}
              </Text>
            </View>
          )
        }

        const req = item as Request
        const isScheduledNow = new Date(req.scheduled_at) <= new Date()
        const isLoading = loading === req.id

        const statusColors: Record<string, { bg: string; text: string }> = {
          pending:  { bg: 'bg-yellow-100', text: 'text-yellow-700' },
          accepted: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
          rejected: { bg: 'bg-red-100',    text: 'text-red-700'    },
          sent:     { bg: 'bg-green-100',  text: 'text-green-700'  },
        }
        const sc = statusColors[req.status] ?? statusColors.pending

        return (
          <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-3">
            <View className="flex-row items-start justify-between mb-2">
              <View className="flex-1 pr-2">
                <Text className="text-xs text-gray-400 mb-1">from @{req.requester?.username}</Text>
                <Text className="font-semibold text-gray-900">{req.task?.title}</Text>
              </View>
              <View className={`rounded-full px-2 py-0.5 ${sc.bg}`}>
                <Text className={`text-xs font-medium ${sc.text}`}>{req.status}</Text>
              </View>
            </View>
            {req.task?.why ? <Text className="text-orange-600 text-xs mb-2">💡 {req.task.why}</Text> : null}
            <Text className="text-gray-400 text-xs mb-1">Difficulty: {'⚡'.repeat(req.task?.difficulty ?? 1)}</Text>
            <Text className="text-gray-500 text-xs">Remind by: {new Date(req.scheduled_at).toLocaleString()}</Text>

            {req.status === 'pending' && (
              <View className="flex-row gap-2 mt-4">
                <TouchableOpacity
                  onPress={() => respond(req.id, 'accepted', req.requester_id, req.task.title)}
                  disabled={isLoading}
                  className="flex-1 bg-orange-500 rounded-2xl py-2.5 items-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  {isLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white text-sm font-medium">✅ Accept</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => respond(req.id, 'rejected', req.requester_id, req.task.title)}
                  disabled={isLoading}
                  className="flex-1 bg-gray-100 rounded-2xl py-2.5 items-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  <Text className="text-gray-600 text-sm font-medium">❌ Reject</Text>
                </TouchableOpacity>
              </View>
            )}

            {req.status === 'accepted' && (
              <TouchableOpacity
                onPress={() => sendReminder(req.id, req.requester_id, req.task.title, req.task.id)}
                disabled={isLoading}
                className={`w-full mt-4 rounded-2xl py-3 items-center disabled:opacity-50 ${
                  isScheduledNow ? 'bg-blue-500' : 'bg-gray-100'
                }`}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color={isScheduledNow ? '#fff' : '#6b7280'} size="small" />
                ) : (
                  <Text className={`text-sm font-medium ${isScheduledNow ? 'text-white' : 'text-gray-500'}`}>
                    {isScheduledNow ? '🔔 Send Reminder Now!' : `🕐 Send Reminder (${new Date(req.scheduled_at).toLocaleString()})`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )
      }}
    />
  )
}
