const LOCAL_API_URL = 'http://localhost:3001/api'
const RENDER_API_URL = 'https://thinkflow-6t7n.onrender.com/api'

export const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }

  return process.env.NODE_ENV === 'development' ? LOCAL_API_URL : RENDER_API_URL
}

export const getApiOrigin = () => getApiUrl().replace(/\/api\/?$/, '')

