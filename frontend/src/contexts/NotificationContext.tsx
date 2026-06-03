import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import type { SseEvent, NewEstimatePayload } from '@yipitdata/shared'
import { useAuth } from './AuthContext'

export interface Notification {
  id: string
  message: string
  payload: NewEstimatePayload
  timestamp: string
  read: boolean
}

interface NotificationContextValue {
  notifications: Notification[]
  unreadCount: number
  markAllRead: () => void
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    if (!isAuthenticated || !token) return

    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`)

    es.addEventListener('NEW_ESTIMATE', (e) => {
      const event: SseEvent = JSON.parse(e.data)
      const payload = event.payload as unknown as NewEstimatePayload

      const notification: Notification = {
        id: crypto.randomUUID(),
        message: `New ${payload.estimateType === 'mtd' ? 'MTD' : 'estimate'}: ${payload.companyName} — ${payload.kpiName}`,
        payload,
        timestamp: event.timestamp,
        read: false,
      }

      setNotifications((prev) => [notification, ...prev].slice(0, 50))
      toast.success(notification.message, { duration: 4000, icon: '📊' })
    })

    es.onerror = () => {
      // Auto-reconnects; suppress console noise in dev
    }

    return () => es.close()
  }, [isAuthenticated, token])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => setNotifications([]), [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead, clearAll }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
