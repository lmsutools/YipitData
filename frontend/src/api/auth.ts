import { apiClient } from './client'
import type { LoginResponse } from '@yipitdata/shared'

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return data
}
