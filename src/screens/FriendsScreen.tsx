import React, { useCallback, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

type UserProfile = { id: string; username: string; avatar_url: string | null }
type Friendship = {
  id: string; status: string; requester_id: string; addressee_id: string
  requester: UserProfile; addressee: UserProfile
}

export default function FriendsScreen() {
  const { user } = useAuth()
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState<UserProfile | null | 'not_found'>(null)
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [fetching, setFetching] = useState(true)

  async function fetchFriendships() {
    if (!user) return
    const { data } = await supabase
      .from('friendships')
      .select('id, status, requester_id, addressee_id, requester:users!friendships_requester_id_fkey(id,username,avatar_url), addressee:users!friendships_addressee_id_fkey(id,username,avatar_url)')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
    setFriendships((data ?? []) as unknown as Friendship[])
    setFetching(false)
    setRefreshing(false)
  }

  useFocusEffect(useCallback(() => { fetchFriendships() }, [user]))

  async function searchUser() {
    if (!search.trim()) return
    setSearching(true)
    setSearchResult(null)
    const { data } = await supabase
      .from('users')
      .select('id, username, avatar_url')
      .eq('username', search.toLowerCase().trim())
      .neq('id', user!.id)
      .single()
    setSearchResult(data ?? 'not_found')
    setSearching(false)
  }

  async function sendRequest(addresseeId: string) {
    setAdding(true)
    await supabase.from('friendships').insert({ requester_id: user!.id, addressee_id: addresseeId })
    setAdding(false)
    setSearch('')
    setSearchResult(null)
    fetchFriendships()
  }

  async function acceptRequest(friendshipId: string) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    fetchFriendships()
  }

  function getOther(f: Friendship): UserProfile {
    return f.requester_id === user!.id ? f.addressee : f.requester
  }

  const accepted = friendships.filter(f => f.status === 'accepted')
  const incoming = friendships.filter(f => f.status === 'pending' && f.addressee_id === user!.id)
  const outgoing = friendships.filter(f => f.status === 'pending' && f.requester_id === user!.id)

  if (fetching) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFriendships() }} tintColor="#f97316" />}
        ListHeaderComponent={
          <View className="gap-4 p-4 pb-8">

            {/* Search */}
            <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <Text className="font-semibold text-gray-900 mb-3">Add a friend</Text>
              <View className="flex-row gap-2">
                <TextInput
                  className="flex-1 border border-gray-200 rounded-2xl px-4 py-3 text-sm"
                  placeholder="Search by username..."
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={searchUser}
                />
                <TouchableOpacity
                  onPress={searchUser}
                  disabled={searching}
                  className="bg-orange-500 rounded-2xl px-4 py-3 items-center justify-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text className="text-white font-semibold text-sm">Search</Text>}
                </TouchableOpacity>
              </View>
              {searchResult === 'not_found' && (
                <Text className="text-red-500 text-sm mt-3">No user found with that username.</Text>
              )}
              {searchResult && searchResult !== 'not_found' && (
                <View className="flex-row items-center justify-between mt-3 p-3 bg-gray-50 rounded-2xl">
                  <Text className="font-medium text-gray-800">@{searchResult.username}</Text>
                  <TouchableOpacity
                    onPress={() => sendRequest((searchResult as UserProfile).id)}
                    disabled={adding}
                    className="bg-orange-500 rounded-xl px-3 py-1.5 disabled:opacity-50"
                    activeOpacity={0.8}
                  >
                    {adding ? <ActivityIndicator color="#fff" size="small" /> : (
                      <Text className="text-white text-xs font-medium">Send Request</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Incoming requests */}
            {incoming.length > 0 && (
              <View>
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Friend Requests</Text>
                {incoming.map(f => (
                  <View key={f.id} className="bg-white rounded-2xl p-4 shadow-sm border border-orange-100 flex-row items-center justify-between mb-2">
                    <Text className="font-medium text-gray-800">@{getOther(f).username}</Text>
                    <TouchableOpacity
                      onPress={() => acceptRequest(f.id)}
                      className="bg-orange-500 rounded-xl px-3 py-1.5"
                      activeOpacity={0.8}
                    >
                      <Text className="text-white text-xs font-medium">Accept</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Friends list */}
            {accepted.length > 0 && (
              <View>
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Friends ({accepted.length})</Text>
                {accepted.map(f => (
                  <View key={f.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex-row items-center gap-3 mb-2">
                    <View className="w-9 h-9 rounded-full bg-orange-200 items-center justify-center">
                      <Text className="text-sm font-bold text-orange-700">{getOther(f).username[0].toUpperCase()}</Text>
                    </View>
                    <Text className="font-medium text-gray-800">@{getOther(f).username}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Sent pending */}
            {outgoing.length > 0 && (
              <View>
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pending Sent</Text>
                {outgoing.map(f => (
                  <View key={f.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-2">
                    <Text className="text-gray-500 text-sm">@{getOther(f).username} — waiting for response</Text>
                  </View>
                ))}
              </View>
            )}

            {!friendships.length && (
              <View className="items-center py-12">
                <Text className="text-4xl mb-3">🤝</Text>
                <Text className="text-gray-400 text-center">No friends yet. Search for someone to get started!</Text>
              </View>
            )}
          </View>
        }
      />
    </KeyboardAvoidingView>
  )
}
