import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Layout from '../components/Layout'
import { useRouter } from 'next/router'

const schema = z.object({ email: z.string().email(), password: z.string().min(6) })

export default function Login() {
  const router = useRouter()
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (data: any) => {
    try {
      const resp = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.email }) })
      const body = await resp.json()
      if (body.token) {
        localStorage.setItem('isp_token', body.token)
        router.push('/projects')
      } else {
        alert('login failed')
      }
    } catch (e) {
      alert('login failed')
    }
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Sign in</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input {...register('email')} className="mt-1 block w-full border rounded p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input type="password" {...register('password')} className="mt-1 block w-full border rounded p-2" />
          </div>
          <div>
            <button className="bg-blue-600 text-white px-4 py-2 rounded">Sign in</button>
          </div>
        </form>
      </div>
    </Layout>
  )
}
