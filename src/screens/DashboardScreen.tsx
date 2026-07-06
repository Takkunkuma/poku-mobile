import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, SectionList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { difficultyColor } from '@/lib/difficulty'
import { scheduleLocalNotification } from '@/lib/notifications'
import ReminderToSendCard, { type ReminderRequest } from '@/components/ReminderToSendCard'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Task = {
  id: string; title: string; description: string | null
  why: string | null; difficulty: number; status: string
}

type Nav = NativeStackNavigationProp<DashboardStackParamList>

// Show the word "pokes" next to the count until the user has seen the dashboard
// a few times, then collapse to just the number. Learned once, per device.
const POKE_LABEL_KEY = 'poke_label_views'
const POKE_LABEL_THRESHOLD = 5

function PokePill({ count, showWord }: { count: number; showWord: boolean }) {
  if (count === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text style={{ fontSize: 12, color: '#9ca3af' }}>0{showWord ? ' pokes' : ''}</Text>
      </View>
    )
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#1f2937', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
      <Text style={{ fontSize: 13 }}>👉</Text>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>{count}</Text>
      {showWord && <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{count === 1 ? 'poke' : 'pokes'}</Text>}
    </View>
  )
}

export default function DashboardScreen() {
  const { user, username, refreshProfile } = useAuth()
  const navigation = useNavigation<Nav>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [reminders, setReminders] = useState<ReminderRequest[]>([])
  const [pokes, setPokes] = useState<Map<string, number>>(new Map())
  const [showPokeWord, setShowPokeWord] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  // Ticks once a second to drive the live "send reminder" countdown.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Resolve whether to show the "pokes" word, bumping the seen-counter once.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const raw = await SecureStore.getItemAsync(POKE_LABEL_KEY)
        const n = raw ? parseInt(raw, 10) : 0
        if (active) setShowPokeWord(n < POKE_LABEL_THRESHOLD)
        if (n < POKE_LABEL_THRESHOLD) await SecureStore.setItemAsync(POKE_LABEL_KEY, String(n + 1))
      } catch { /* default to showing the word */ }
    })()
    return () => { active = false }
  }, [])

  async function fetchTasks() {
    if (!user) return
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, why, difficulty, status')
      .eq('owner_id', user.id)
      .in('status', ['open', 'reminded'])
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
  }

  // Reminders I've accepted and still owe to a friend — these show on Home with
  // a live countdown + send button (the "remind your friend" half of the app).
  async function fetchReminders() {
    if (!user) return
    const { data } = await supabase
      .from('reminder_requests')
      .select('id, task_id, status, scheduled_at, requester_id, repeat_count, reminders_sent, notification_type, interval_minutes, task:tasks(id,title,why,difficulty), requester:users!reminder_requests_requester_id_fkey(username)')
      .eq('assignee_id', user.id)
      .eq('status', 'accepted')
      .order('scheduled_at', { ascending: true })
    const rows = (data ?? []) as unknown as ReminderRequest[]
    // Only those with reminders still left to send are actionable.
    setReminders(rows.filter(r => (r.repeat_count ?? 1) - (r.reminders_sent ?? 0) > 0))
  }

  // Total pokes per task = sum of reminders actually sent to me across all
  // the friends I asked. Resets naturally when the task is completed (it leaves
  // the active list).
  async function fetchPokes() {
    if (!user) return
    const { data } = await supabase
      .from('reminder_requests')
      .select('task_id, reminders_sent')
      .eq('requester_id', user.id)
    if (data) {
      const m = new Map<string, number>()
      data.forEach(r => { m.set(r.task_id, (m.get(r.task_id) ?? 0) + (r.reminders_sent ?? 0)) })
      setPokes(m)
    }
  }

  async function load() {
    await Promise.all([fetchTasks(), fetchReminders(), fetchPokes()])
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => {
    load()
    refreshProfile()
  }, [user]))

  // Send the next reminder to the friend who asked you. Moved here from the
  // Inbox so Home is the single place you act on reminders you owe.
  async function sendReminder(req: ReminderRequest) {
    setSendingId(req.id)
    const newCount = (req.reminders_sent ?? 0) + 1
    const isLast = newCount >= (req.repeat_count ?? 1)

    const { error: updateError } = await supabase
      .from('reminder_requests')
      .update({ reminders_sent: newCount, status: isLast ? 'sent' : 'accepted' })
      .eq('id', req.id)

    if (updateError) {
      setSendingId(null)
      Alert.alert('Couldn’t send reminder', 'Something went wrong. Please check your connection and try again.')
      return
    }

    await supabase.from('tasks').update({ status: 'reminded' }).eq('id', req.task_id)

    const { error: notifError } = await supabase.from('notifications').insert({
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

    await scheduleLocalNotification(
      'Reminder sent!',
      `You reminded @${req.requester.username} about "${req.task.title}"`,
    )
    setSendingId(null)
    fetchReminders()

    if (notifError) {
      Alert.alert('Reminder recorded', `It counted, but @${req.requester.username} may not have gotten a push notification.`)
    }
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'Home',
      headerLargeTitle: true,
      headerLargeTitleShadowVisible: false,
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Ionicons name="person-circle-outline" size={30} color="#9ca3af" />
        </TouchableOpacity>
      ),
      // Two separate native header buttons. sharesBackground:false makes iOS 26
      // give each its own glass circle (instead of bundling them into one
      // capsule), matching the lone profile button on the left.
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: '',
          icon: { type: 'sfSymbol', name: 'archivebox' },
          onPress: () => navigation.navigate('Archive'),
          tintColor: '#6b7280',
          sharesBackground: false,
          accessibilityLabel: 'Past tasks',
        },
        {
          type: 'button',
          label: '',
          icon: { type: 'sfSymbol', name: 'plus' },
          onPress: () => navigation.navigate('NewTask'),
          tintColor: '#f97316',
          sharesBackground: false,
          accessibilityLabel: 'New task',
        },
      ],
    })
  }, [navigation])

  // Realtime — a new poke bumps the count and flips the task to "reminded";
  // changes to reminders I owe keep the "Reminders to send" section fresh.
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('home-updates')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, (payload) => {
        const n = payload.new as { type: string; payload: Record<string, string> }
        if (n.type === 'reminder_sent' && n.payload.task_id) {
          setPokes(prev => new Map(prev).set(n.payload.task_id, (prev.get(n.payload.task_id) ?? 0) + 1))
          setTasks(prev => prev.map(t => t.id === n.payload.task_id ? { ...t, status: 'reminded' } : t))
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reminder_requests',
        filter: `assignee_id=eq.${user.id}`,
      }, () => fetchReminders())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  const sections = [
    ...(reminders.length ? [{ key: 'reminders' as const, title: 'Reminders to send', data: reminders }] : []),
    { key: 'tasks' as const, title: 'Your tasks', data: tasks },
  ]

  return (
    <View className="flex-1 bg-gray-50">
      <SectionList
        sections={sections as any}
        keyExtractor={(item: any) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          username ? <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>@{username}</Text> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#f97316" />}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📝</Text>
            <Text className="text-gray-400 text-center">No tasks yet. Create your first one!</Text>
          </View>
        }
        // Only label sections when both are present, so a lone task list stays clean.
        renderSectionHeader={({ section }: any) =>
          reminders.length > 0 ? (
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: section.key === 'tasks' ? 20 : 0, marginBottom: 8 }}>
              {section.title}
            </Text>
          ) : null
        }
        renderItem={({ item, section }: any) => {
          if (section.key === 'reminders') {
            const req = item as ReminderRequest
            return (
              <ReminderToSendCard
                req={req}
                now={now}
                isLoading={sendingId === req.id}
                onSend={sendReminder}
              />
            )
          }

          const task = item as Task
          const isReminded = task.status === 'reminded'
          const pokeCount = pokes.get(task.id) ?? 0

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
              className="rounded-2xl p-4 border mb-3"
              style={{
                backgroundColor: difficultyColor(task.difficulty, 0.15),
                borderColor: difficultyColor(task.difficulty, 0.5),
              }}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-semibold text-gray-900">{task.title}</Text>
                  {task.why ? (
                    <Text className="text-gray-500 text-xs mt-1" numberOfLines={1}>💡 {task.why}</Text>
                  ) : null}
                  {isReminded && (
                    <Text className="text-gray-600 text-xs font-medium mt-1.5">👆 Tap to mark this done</Text>
                  )}
                </View>
                <PokePill count={pokeCount} showWord={showPokeWord} />
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}
