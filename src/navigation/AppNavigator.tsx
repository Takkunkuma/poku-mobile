import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'

import { useAuth } from '@/context/AuthContext'
import LandingScreen from '@/screens/LandingScreen'
import SetupScreen from '@/screens/SetupScreen'
import DashboardScreen from '@/screens/DashboardScreen'
import NewTaskScreen from '@/screens/NewTaskScreen'
import TaskDetailScreen from '@/screens/TaskDetailScreen'
import InboxScreen from '@/screens/InboxScreen'
import FriendsScreen from '@/screens/FriendsScreen'
import ProfileScreen from '@/screens/ProfileScreen'
import ArchiveScreen from '@/screens/ArchiveScreen'

// ── Param list types ────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Landing: undefined
  Setup: undefined
}

export type DashboardStackParamList = {
  Dashboard: undefined
  TaskDetail: { taskId: string }
  NewTask: undefined
  Profile: undefined
  Archive: undefined
}

type TabParamList = {
  DashboardTab: undefined
  Inbox: undefined
  Friends: undefined
}

// ── Navigators ──────────────────────────────────────────────────────────────

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>()
const Tab = createBottomTabNavigator<TabParamList>()

const HEADER_STYLE = {
  headerStyle: { backgroundColor: '#ffffff' },
  headerTintColor: '#f97316',
  headerTitleStyle: { fontWeight: '600' as const, color: '#111827' },
  headerShadowVisible: false,
}

function DashboardStackNavigator() {
  return (
    <DashboardStack.Navigator screenOptions={HEADER_STYLE}>
      <DashboardStack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
      <DashboardStack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Task Detail' }} />
      <DashboardStack.Screen name="NewTask" component={NewTaskScreen} options={{ title: 'New Task', headerBackTitle: 'Back' }} />
      <DashboardStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <DashboardStack.Screen name="Archive" component={ArchiveScreen} options={{ title: 'Past Tasks' }} />
    </DashboardStack.Navigator>
  )
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...HEADER_STYLE,
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e5e7eb', borderTopWidth: 0.5 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            DashboardTab: { active: 'checkmark-circle',        inactive: 'checkmark-circle-outline' },
            Inbox:        { active: 'mail',                    inactive: 'mail-outline' },
            Friends:      { active: 'people',                  inactive: 'people-outline' },
          }
          const icon = icons[route.name]
          return <Ionicons name={focused ? icon.active : icon.inactive} size={size} color={color} />
        },
      })}
    >
      <Tab.Screen name="DashboardTab" component={DashboardStackNavigator} options={{ headerShown: false, title: 'Tasks' }} />
      <Tab.Screen name="Inbox"        component={InboxScreen}             options={{ title: 'Inbox' }} />
      <Tab.Screen name="Friends"      component={FriendsScreen}           options={{ title: 'Friends' }} />
    </Tab.Navigator>
  )
}

// ── Root navigator ───────────────────────────────────────────────────────────

export default function AppNavigator() {
  const { session, username, loading } = useAuth()

  if (loading) return null

  const isAuthed = !!session
  const hasUsername = !!username

  return (
    <NavigationContainer>
      {!isAuthed ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Landing" component={LandingScreen} />
        </AuthStack.Navigator>
      ) : !hasUsername ? (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Setup" component={SetupScreen} />
        </AuthStack.Navigator>
      ) : (
        <AppTabs />
      )}
    </NavigationContainer>
  )
}
