import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { scheduleLocalNotification } from '@/lib/notifications'

type Request = {
  id: string; task_id: string; status: string; scheduled_at: string; requester_id: string
  repeat_count: number; reminders_sent: number; notification_type: string
  task: { id: string; title: string; description: string; why: string; difficulty: number }
  requester: { username: string }
}
type CompletionNotif = {
  id: string; created_at: string
  payload: { task_title: string; owner_username: string; points_earned?: string }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

const TABS = [
  { key: 'requests',  label: 'Requests' },
  { key: 'past',      label: 'Past' },
  { key: 'completed', label: 'Completed' },
] as const
type TabKey = (typeof TABS)[number]['key']

const EMPTY_STATES: Record<TabKey, { emoji: string; text: string }> = {
  requests:  { emoji: '📭', text: 'No reminder requests right now.' },
  past:      { emoji: '🕰️', text: 'No past requests yet.' },
  completed: { emoji: '🎉', text: 'No completed tasks from friends yet.' },
}

const segStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(229,231,235,0.7)',
    borderRadius: 12,
    padding: 4,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  itemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  label: { fontSize: 14, fontWeight: '500' },
  labelActive: { color: '#111827' },
  labelInactive: { color: '#6b7280' },
})

export default function InboxScreen() {
  const { user, username } = useAuth()
  const [requests, setRequests] = useState<Request[]>([])
  const [completions, setCompletions] = useState<CompletionNotif[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetching, setFetching] = useState(true)

  // Rejection modal
  const [rejectTarget, setRejectTarget] = useState<{ id: string; requesterId: string; taskTitle: string } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const [tab, setTab] = useState<TabKey>('requests')

  async function fetchData() {
    if (!user) return
    const [reqRes, notifRes] = await Promise.all([
      supabase
        .from('reminder_requests')
        .select('id, task_id, status, scheduled_at, requester_id, repeat_count, reminders_sent, notification_type, task:tasks(id,title,description,why,difficulty), requester:users!reminder_requests_requester_id_fkey(username)')
        .eq('assignee_id', user.id)
        .not('status', 'in', '("cancelled")')
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

  // Initial fetch + refetch when the signed-in user changes.
  // Live updates are handled by the realtime subscription below, so we don't
  // need useFocusEffect here — avoiding a navigation-context dependency that
  // broke on tab-toggle re-renders.
  useEffect(() => { fetchData() }, [user])

  // Realtime — new reminder requests appear instantly without re-opening inbox
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel(`inbox-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'reminder_requests',
        filter: `assignee_id=eq.${user.id}`,
      }, () => fetchData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'reminder_requests',
        filter: `assignee_id=eq.${user.id}`,
      }, () => fetchData())
      // task_done notifications populate the Completed tab — keep it live too
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  async function accept(requestId: string, requesterId: string, taskTitle: string) {
    setLoading(requestId)
    await supabase.from('reminder_requests').update({ status: 'accepted' }).eq('id', requestId)
    await supabase.from('notifications').insert({
      recipient_id: requesterId,
      type: 'request_accepted',
      payload: { task_title: taskTitle, request_id: requestId },
    })
    setLoading(null)
    fetchData()
  }

  async function reject() {
    if (!rejectTarget) return
    const { id, requesterId, taskTitle } = rejectTarget
    setLoading(id)
    await supabase
      .from('reminder_requests')
      .update({ status: 'rejected', rejection_reason: rejectionReason.trim() || null })
      .eq('id', id)
    await supabase.from('notifications').insert({
      recipient_id: requesterId,
      type: 'request_rejected',
      payload: {
        task_title: taskTitle,
        request_id: id,
        rejection_reason: rejectionReason.trim(),
      },
    })
    setLoading(null)
    setRejectTarget(null)
    setRejectionReason('')
    fetchData()
  }

  async function sendReminder(req: Request) {
    setLoading(req.id)
    const newCount = (req.reminders_sent ?? 0) + 1
    const isLast = newCount >= (req.repeat_count ?? 1)

    await supabase
      .from('reminder_requests')
      .update({ reminders_sent: newCount, status: isLast ? 'sent' : 'accepted' })
      .eq('id', req.id)
    await supabase.from('tasks').update({ status: 'reminded' }).eq('id', req.task_id)
    await supabase.from('notifications').insert({
      recipient_id: req.requester_id,
      type: 'reminder_sent',
      payload: {
        task_title: req.task.title,
        from_user_id: user!.id,
        from_username: username,
        task_id: req.task_id,
        notification_type: req.notification_type,
      },
    })
    await scheduleLocalNotification('Reminder sent!', `You reminded @${req.requester.username} about "${req.task.title}"`)
    setLoading(null)
    fetchData()
  }

  const pending  = requests.filter(r => r.status === 'pending')
  const accepted = requests.filter(r => r.status === 'accepted')
  const past     = requests.filter(r => ['rejected', 'sent'].includes(r.status))

  const tabCounts: Record<TabKey, number> = {
    requests: pending.length + accepted.length,
    past: past.length,
    completed: completions.length,
  }
  const tabData: (Request | CompletionNotif)[] =
    tab === 'requests' ? [...pending, ...accepted]
    : tab === 'past' ? past
    : completions

  if (fetching) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Segmented tab bar — uses inline styles for the active/inactive state.
          NativeWind crashes if a dynamic className adds styles after the initial
          render (it tries to "upgrade" the component and stringifies props, which
          walks into React Navigation's throwing getKey getter). Inline styles
          sidestep that entirely. */}
      <View style={segStyles.bar}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[segStyles.item, active && segStyles.itemActive]}
              activeOpacity={0.7}
            >
              <Text style={[segStyles.label, active ? segStyles.labelActive : segStyles.labelInactive]}>
                {t.label}{tabCounts[t.key] > 0 ? ` (${tabCounts[t.key]})` : ''}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <FlatList
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor="#f97316" />}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">{EMPTY_STATES[tab].emoji}</Text>
            <Text className="text-gray-400">{EMPTY_STATES[tab].text}</Text>
          </View>
        }
        data={tabData}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          if (tab === 'completed') {
            const n = item as CompletionNotif
            return (
              <View className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-2">
                <Text className="text-green-700 font-semibold text-sm">
                  @{n.payload.owner_username} completed "{n.payload.task_title}"
                </Text>
                <Text className="text-green-500 text-xs mt-0.5">
                  {n.payload.points_earned ? `+${n.payload.points_earned} pts` : '+points'} 🏆 · {new Date(n.created_at).toLocaleString()}
                </Text>
              </View>
            )
          }

          const req = item as Request
          const isLoading = loading === req.id
          const isScheduledNow = new Date(req.scheduled_at) <= new Date()
          const remindersDone = req.reminders_sent ?? 0
          const remindersLeft = (req.repeat_count ?? 1) - remindersDone
          const nextOrdinal = ordinal(remindersDone + 1)

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
              <Text className="text-gray-500 text-xs">
                First reminder: {new Date(req.scheduled_at).toLocaleString()}
              </Text>
              {(req.repeat_count ?? 1) > 1 && (
                <Text className="text-gray-400 text-xs mt-0.5">
                  {req.repeat_count}× reminders · {remindersDone} sent so far
                </Text>
              )}

              {req.status === 'pending' && (
                <View className="flex-row gap-2 mt-4">
                  <TouchableOpacity
                    onPress={() => accept(req.id, req.requester_id, req.task.title)}
                    disabled={isLoading}
                    className="flex-1 bg-orange-500 rounded-2xl py-2.5 items-center disabled:opacity-50"
                    activeOpacity={0.8}
                  >
                    {isLoading ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text className="text-white text-sm font-medium">✅ Accept</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setRejectTarget({ id: req.id, requesterId: req.requester_id, taskTitle: req.task.title })}
                    disabled={isLoading}
                    className="flex-1 bg-gray-100 rounded-2xl py-2.5 items-center disabled:opacity-50"
                    activeOpacity={0.8}
                  >
                    <Text className="text-gray-600 text-sm font-medium">❌ Reject</Text>
                  </TouchableOpacity>
                </View>
              )}

              {req.status === 'accepted' && remindersLeft > 0 && (
                <TouchableOpacity
                  onPress={() => sendReminder(req)}
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
                      {isScheduledNow
                        ? `🔔 Send ${nextOrdinal} reminder`
                        : `🕐 Send ${nextOrdinal} reminder (${new Date(req.scheduled_at).toLocaleString()})`}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {req.status === 'accepted' && remindersLeft === 0 && (
                <View className="mt-4 py-3 items-center bg-gray-50 rounded-2xl">
                  <Text className="text-gray-400 text-sm">All {req.repeat_count} reminders sent</Text>
                </View>
              )}
            </View>
          )
        }}
      />

      {/* Rejection reason modal */}
      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="slide"
        onRequestClose={() => { setRejectTarget(null); setRejectionReason('') }}
      >
        <KeyboardAvoidingView
          className="flex-1 justify-end bg-black/40"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="bg-white rounded-t-3xl p-6 gap-4">
            <Text className="text-lg font-bold text-gray-900">Reject request</Text>
            <Text className="text-gray-500 text-sm">Optionally tell them why you can't do this.</Text>
            <TextInput
              className="border border-gray-200 rounded-2xl px-4 py-3 text-sm"
              placeholder="Reason (optional)"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoFocus
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => { setRejectTarget(null); setRejectionReason('') }}
                className="flex-1 border border-gray-200 rounded-2xl py-3 items-center"
                activeOpacity={0.7}
              >
                <Text className="text-gray-500 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={reject}
                className="flex-1 bg-red-500 rounded-2xl py-3 items-center"
                activeOpacity={0.8}
              >
                <Text className="text-white font-medium">Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}
