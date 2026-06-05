import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Nav = NativeStackNavigationProp<DashboardStackParamList>

const DIFFICULTIES = [
  { value: 1, label: '1', desc: 'Easy' },
  { value: 2, label: '2', desc: 'Manageable' },
  { value: 3, label: '3', desc: 'Moderate' },
  { value: 4, label: '4', desc: 'Hard' },
  { value: 5, label: '5', desc: 'Very Hard' },
]

export default function NewTaskScreen() {
  const { user } = useAuth()
  const navigation = useNavigation<Nav>()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', why: '', difficulty: 3 })

  function set(key: string, value: string | number) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit() {
    if (!form.title.trim()) return
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...form, owner_id: user!.id })
      .select()
      .single()

    if (!error && data) {
      navigation.replace('TaskDetail', { taskId: data.id })
    }
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 gap-5">
          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Title *</Text>
            <TextInput
              className="border border-gray-200 rounded-2xl px-4 py-3 text-sm"
              placeholder="e.g. Create student document for tutoring"
              value={form.title}
              onChangeText={v => set('title', v)}
              returnKeyType="next"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Description</Text>
            <TextInput
              className="border border-gray-200 rounded-2xl px-4 py-3 text-sm"
              placeholder="More details..."
              value={form.description}
              onChangeText={v => set('description', v)}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-1">Why does this matter? 💡</Text>
            <TextInput
              className="border border-gray-200 rounded-2xl px-4 py-3 text-sm"
              placeholder="e.g. Missing this could cause problems..."
              value={form.why}
              onChangeText={v => set('why', v)}
              returnKeyType="done"
            />
          </View>

          <View>
            <Text className="text-sm font-medium text-gray-700 mb-2">How hard is this? ⚡</Text>
            <View className="flex-row gap-2">
              {DIFFICULTIES.map(d => (
                <TouchableOpacity
                  key={d.value}
                  onPress={() => set('difficulty', d.value)}
                  className={`flex-1 py-2.5 rounded-2xl items-center border ${
                    form.difficulty === d.value
                      ? 'bg-orange-500 border-orange-500'
                      : 'bg-white border-gray-200'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-sm font-semibold ${form.difficulty === d.value ? 'text-white' : 'text-gray-500'}`}>
                    {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-xs text-gray-400 mt-1.5">
              {DIFFICULTIES.find(d => d.value === form.difficulty)?.desc}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || !form.title.trim()}
            className="bg-orange-500 rounded-2xl py-4 items-center disabled:opacity-50 mt-1"
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Task</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
