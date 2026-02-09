import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('isp_token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchProjects() {
  try {
    const res = await axios.get(`${API_URL}/api/projects`, { headers: getAuthHeaders() })
    return res.data
  } catch (e) {
    // Fallback: return empty
    return { projects: [] }
  }
}

export async function fetchProject(id?: string) {
  if (!id) return null
  try {
    const res = await axios.get(`${API_URL}/api/projects/${id}`, { headers: getAuthHeaders() })
    return res.data
  } catch (e) {
    return null
  }
}

export async function fetchProfitability(projectId?: string) {
  try {
    const res = await axios.get(`${API_URL}/api/profitability${projectId ? `?projectId=${projectId}` : ''}`, { headers: getAuthHeaders() })
    return res.data
  } catch (e) {
    return null
  }
}

export async function createEvent(payload: any) {
  try {
    const res = await axios.post(`${API_URL}/api/events`, payload, { headers: getAuthHeaders() })
    return res.data
  } catch (e) {
    throw e
  }
}

export async function login(
  email: string,
  options?: {
    password?: string
    organizationSlug?: string
  }
) {
  const res = await axios.post(`${API_URL}/api/login`, {
    email,
    password: options?.password,
    organizationSlug: options?.organizationSlug
  })
  return res.data
}
