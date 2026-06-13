import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { difficultyColor } from '@/lib/difficulty'
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
  const [pokes, setPokes] = useState<Map<string, number>>(new Map())
  const [showPokeWord, setShowPokeWord] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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
    await Promise.all([fetchTasks(), fetchPokes()])
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => {
    load()
    refreshProfile()
  }, [user]))

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'My Tasks',
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

  // Realtime — a new poke bumps the count and flips the task to "reminded".
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('dashboard-reminders')
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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={tasks}
        keyExtractor={t => t.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          username ? <Text style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>@{username}</Text> : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#f97316" />}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📝</Text>
            <Text className="text-gray-400 text-center">No tasks yet. Create your first one!</Text>
          </View>
        }
        renderItem={({ item: task }) => {
          const isReminded = task.status === 'reminded'
          const pokeCount = pokes.get(task.id) ?? 0

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
              className="rounded-2xl p-4 border"
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
