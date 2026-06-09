import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from '@/lib/supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
})

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Push] Skipped — not a physical device')
    return null
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: false,
        provideAppNotificationSettings: false,
        allowProvisional: false,
      },
    })
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission denied — status:', finalStatus)
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  if (!projectId) {
    console.log('[Push] No EAS projectId found in config')
    return null
  }

  let token: string
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
    console.log('[Push] Token obtained:', token)
  } catch (e) {
    console.log('[Push] Failed to get push token:', e)
    return null
  }

  // Save token to Supabase so the Edge Function can use it for background push
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { error } = await supabase
      .from('users')
      .update({ expo_push_token: token })
      .eq('id', user.id)
    if (error) {
      console.log('[Push] Failed to save token to Supabase:', error.message)
    } else {
      console.log('[Push] Token saved to Supabase for user:', user.id)
    }
  } else {
    console.log('[Push] No authenticated user when saving token')
  }

  return token
}

export async function scheduleLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  })
}
