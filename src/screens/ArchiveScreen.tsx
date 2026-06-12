import React, { useCallback, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Task = {
  id: string; title: string; description: string | null
  why: string | null; difficulty: number; status: string; created_at: string
}

type Nav = NativeStackNavigationProp<DashboardStackParamList>

export default function ArchiveScreen() {
  const { user } = useAuth()
  const navigation = useNavigation<Nav>()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    if (!user) return
    const { data } = await supabase
      .from('tasks')
      .select('id, title, description, why, difficulty, status, created_at')
      .eq('owner_id', user.id)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
    setTasks(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { load() }, [user]))

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={tasks}
        keyExtractor={t => t.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor="#f97316" />}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Text className="text-4xl mb-3">📦</Text>
            <Text className="text-gray-400 text-center">No completed tasks yet.{'\n'}Finished tasks will show up here.</Text>
          </View>
        }
        renderItem={({ item: task }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
            activeOpacity={0.8}
          >
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="font-semibold text-gray-900">{task.title}</Text>
                {task.why ? (
                  <Text className="text-orange-500 text-xs mt-1">💡 {task.why}</Text>
                ) : null}
                <Text className="text-gray-400 text-xs mt-1">
                  {new Date(task.created_at).toLocaleDateString()}
                </Text>
              </View>
              <View className="items-end gap-1">
                <View className="rounded-full px-2 py-0.5 bg-green-100">
                  <Text className="text-xs font-medium text-green-700">done</Text>
                </View>
                <Text className="text-xs text-gray-400">{'⚡'.repeat(task.difficulty)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}
