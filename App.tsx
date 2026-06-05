import './global.css'
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '@/context/AuthContext'
import NotificationProvider from '@/components/NotificationProvider'
import AppNavigator from '@/navigation/AppNavigator'
import { registerForPushNotifications } from '@/lib/notifications'

export default function App() {
  useEffect(() => {
    registerForPushNotifications()
  }, [])

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppNavigator />
          <StatusBar style="dark" />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
