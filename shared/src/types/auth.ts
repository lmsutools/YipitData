export interface LoginBody {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: {
    id: number
    email: string
    role: string
  }
}

export interface JwtPayload {
  sub: number
  email: string
  role: string
  iat: number
  exp: number
}
