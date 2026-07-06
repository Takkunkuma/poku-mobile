import React, { useEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native'
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { difficultyColor, difficultyTextColor, difficultyLabel } from '@/lib/difficulty'
import { formatDateTime } from '@/lib/datetime'
import { postComment } from '@/lib/comments'
import type { TabParamList } from '@/navigation/AppNavigator'

type Request = {
  id: string; task_id: string; status: string; scheduled_at: string; requester_id: string
  repeat_count: number; reminders_sent: number; notification_type: string; interval_minutes: number | null
  task: { id: string; title: string; description: string; why: string; difficulty: number }
  requester: { username: string }
}
type CompletionNotif = {
  id: string; created_at: string
  payload: { task_title: string; owner_username: string; points_earned?: string }
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
  const route = useRoute<RouteProp<TabParamList, 'Inbox'>>()
  const navigation = useNavigation<any>()

  // Comments live in the Dashboard stack — hop tabs to open the thread.
  function openComments(req: Request) {
    navigation.navigate('DashboardTab', {
      screen: 'Comments',
      params: { taskId: req.task_id, taskTitle: req.task?.title },
    })
  }
  const [requests, setRequests] = useState<Request[]>([])
  const [completions, setCompletions] = useState<CompletionNotif[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fetching, setFetching] = useState(true)

  // Rejection modal
  const [rejectTarget, setRejectTarget] = useState<{ id: string; requesterId: string; taskId: string; taskTitle: string } | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const [tab, setTab] = useState<TabKey>('requests')

  // A notification tap can deep-link to a specific tab (e.g. task_done →
  // Completed). Honor the param whenever it changes.
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab)
  }, [route.params?.tab])

  async function fetchData() {
    if (!user) return
    const [reqRes, notifRes] = await Promise.all([
      supabase
        .from('reminder_requests')
        .select('id, task_id, status, scheduled_at, requester_id, repeat_count, reminders_sent, notification_type, interval_minutes, task:tasks(id,title,description,why,difficulty), requester:users!reminder_requests_requester_id_fkey(username)')
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
    const { error } = await supabase.from('reminder_requests').update({ status: 'accepted' }).eq('id', requestId)
    if (error) {
      setLoading(null)
      Alert.alert('Couldn’t accept', 'Something went wrong. Please try again.')
      return
    }
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
    const { error } = await supabase
      .from('reminder_requests')
      .update({ status: 'rejected', rejection_reason: rejectionReason.trim() || null })
      .eq('id', id)
    if (error) {
      setLoading(null)
      Alert.alert('Couldn’t reject', 'Something went wrong. Please try again.')
      return
    }
    await supabase.from('notifications').insert({
      recipient_id: requesterId,
      type: 'request_rejected',
      payload: {
        task_title: taskTitle,
        request_id: id,
        rejection_reason: rejectionReason.trim(),
      },
    })
    // Keep the "why" visible in the thread instead of a one-shot alert.
    // notify:false — the request_rejected push above already carries the reason.
    const reason = rejectionReason.trim()
    await postComment({
      taskId: rejectTarget.taskId,
      taskTitle,
      authorId: user!.id,
      authorUsername: username ?? 'Someone',
      body: reason ? `declined the request — "${reason}"` : 'declined the request',
      system: true,
      notify: false,
    })
    setLoading(null)
    setRejectTarget(null)
    setRejectionReason('')
    fetchData()
  }

  // "Requests" is now only incoming requests awaiting your accept/reject —
  // accepted reminders you owe live on Home, where you send them.
  const pending  = requests.filter(r => r.status === 'pending')
  const past     = requests.filter(r => ['rejected', 'sent'].includes(r.status))

  const tabCounts: Record<TabKey, number> = {
    requests: pending.length,
    past: past.length,
    completed: completions.length,
  }
  const tabData: (Request | CompletionNotif)[] =
    tab === 'requests' ? pending
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
                  {n.payload.points_earned ? `+${n.payload.points_earned} pts` : '+points'} 🏆 · {formatDateTime(n.created_at)}
                </Text>
              </View>
            )
          }

          const req = item as Request
          const isLoading = loading === req.id
          const remindersDone = req.reminders_sent ?? 0

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
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity onPress={() => openComments(req)} hitSlop={8}>
                    <Text className="text-sm">💬</Text>
                  </TouchableOpacity>
                  <View className={`rounded-full px-2 py-0.5 ${sc.bg}`}>
                    <Text className={`text-xs font-medium ${sc.text}`}>{req.status}</Text>
                  </View>
                </View>
              </View>

              {req.task?.why ? <Text className="text-orange-600 text-xs mb-2">💡 {req.task.why}</Text> : null}
              <View
                className="self-start rounded-full px-2.5 py-0.5 mb-1.5"
                style={{ backgroundColor: difficultyColor(req.task?.difficulty ?? 1, 0.15) }}
              >
                <Text className="text-xs font-medium" style={{ color: difficultyTextColor(req.task?.difficulty ?? 1) }}>
                  {difficultyLabel(req.task?.difficulty ?? 1)}
                </Text>
              </View>
              <Text className="text-gray-500 text-xs">
                First reminder: {formatDateTime(req.scheduled_at)}
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
                    onPress={() => setRejectTarget({ id: req.id, requesterId: req.requester_id, taskId: req.task_id, taskTitle: req.task.title })}
                    disabled={isLoading}
                    className="flex-1 bg-gray-100 rounded-2xl py-2.5 items-center disabled:opacity-50"
                    activeOpacity={0.8}
                  >
                    <Text className="text-gray-600 text-sm font-medium">❌ Reject</Text>
                  </TouchableOpacity>
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
