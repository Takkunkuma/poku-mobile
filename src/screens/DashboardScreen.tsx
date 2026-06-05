import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Task = {
  id: string; title: string; description: string | null
  why: string | null; difficulty: number; status: string
}

const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
  open:     { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'open' },
  reminded: { bg: 'bg-blue-100',   text: 'text-blue-700',   label: 'reminded' },
  done:     { bg: 'bg-green-100',  text: 'text-green-700',  label: 'done' },
}

type Nav = NativeStackNavigationProp<DashboardStackParamList>

export default function DashboardScreen() {
  const { user, username, points, refreshProfile } = useAuth()
  const navigation = useNavigation<Nav>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [reminders, setReminders] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function fetchTasks() {
    if (!user) return
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, why, difficulty, status')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
  }

  async function fetchUnreadReminders() {
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('payload')
      .eq('recipient_id', user.id)
      .eq('type', 'reminder_sent')
      .eq('read', false)
    if (data?.length) {
      const map = new Map<string, string>()
      data.forEach(n => {
        if (n.payload?.task_id) map.set(n.payload.task_id, n.payload.from_username ?? 'Your friend')
      })
      setReminders(map)
    }
  }

  async function load() {
    await Promise.all([fetchTasks(), fetchUnreadReminders()])
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
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('NewTask')} hitSlop={8}>
          <Ionicons name="add-circle" size={28} color="#f97316" />
        </TouchableOpacity>
      ),
    })
  }, [navigation])

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
          setReminders(prev => new Map(prev).set(n.payload.task_id, n.payload.from_username ?? 'Your friend'))
          setTasks(prev => prev.map(t => t.id === n.payload.task_id ? { ...t, status: 'reminded' } : t))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user])

  async function markReminderRead(taskId: string) {
    setReminders(prev => { const m = new Map(prev); m.delete(taskId); return m })
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', user!.id)
      .eq('type', 'reminder_sent')
      .eq('read', false)
      .filter('payload->>task_id', 'eq', taskId)
  }

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
          const isReminded = reminders.has(task.id)
          const reminderFrom = reminders.get(task.id)
          const s = statusStyle[task.status] ?? statusStyle.open

          return (
            <View>
              {isReminded && (
                <View className="mb-1 ml-3 flex-row items-center">
                  <View className="bg-orange-500 rounded-2xl rounded-bl-none px-4 py-2 flex-row items-center gap-2 shadow">
                    <Text className="text-white text-sm">
                      🔔 <Text className="font-bold">@{reminderFrom}</Text> is reminding you!
                    </Text>
                    <TouchableOpacity onPress={() => markReminderRead(task.id)}>
                      <Text className="text-white opacity-70 text-xs">✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <TouchableOpacity
                onPress={() => {
                  if (isReminded) markReminderRead(task.id)
                  navigation.navigate('TaskDetail', { taskId: task.id })
                }}
                className={`rounded-2xl p-4 shadow-sm border ${isReminded ? 'border-orange-400 bg-orange-50' : 'bg-white border-gray-100'}`}
                activeOpacity={0.8}
              >
                <View className="flex-row items-start justify-between gap-2">
                  <View className="flex-1">
                    <Text className="font-semibold text-gray-900">{task.title}</Text>
                    {task.description ? (
                      <Text className="text-gray-500 text-sm mt-0.5" numberOfLines={1}>{task.description}</Text>
                    ) : null}
                    {task.why ? (
                      <Text className="text-orange-500 text-xs mt-1">💡 {task.why}</Text>
                    ) : null}
                  </View>
                  <View className="items-end gap-1">
                    <View className={`rounded-full px-2 py-0.5 ${s.bg}`}>
                      <Text className={`text-xs font-medium ${s.text}`}>{s.label}</Text>
                    </View>
                    <Text className="text-xs text-gray-400">{'⚡'.repeat(task.difficulty)}</Text>
                  </View>
                </View>
                {isReminded && (
                  <Text className="text-orange-600 text-xs font-medium mt-2">👆 Tap to mark this done!</Text>
                )}
              </TouchableOpacity>
            </View>
          )
        }}
      />
    </View>
  )
}
