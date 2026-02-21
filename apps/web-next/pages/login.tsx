import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Layout from '../components/Layout'
import { useRouter } from 'next/router'
import { useState } from 'react'
import { login as apiLogin } from '../lib/api'

const schema = z.object({ email: z.string().email(), password: z.string().min(6) })

type LoginFormValues = z.infer<typeof schema>

export default function Login() {
  const router = useRouter()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { register, handleSubmit } = useForm<LoginFormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: LoginFormValues) => {
    try {
      setErrorMessage(null)
      const body = await apiLogin(data.email, { password: data.password })
      if (body?.accessToken) {
        localStorage.setItem('isp_token', body.accessToken)
        router.push('/projects')
      } else {
        setErrorMessage('Login failed. Please check your credentials.')
      }
    } catch (e) {
      setErrorMessage('Login failed. Please try again.')
    }
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-md">
        <h2 className="text-2xl font-semibold mb-4">Sign in</h2>
        {errorMessage ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMessage}</div>
        ) : null}
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
