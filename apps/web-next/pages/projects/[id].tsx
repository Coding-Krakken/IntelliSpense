import Layout from '../../components/Layout'
import { useRouter } from 'next/router'
import { useQuery } from '@tanstack/react-query'
import { fetchProject, fetchProfitability, createEvent } from '../../lib/api'
import { useState } from 'react'

export default function ProjectDetail() {
  const router = useRouter()
  const { id } = router.query as { id?: string }
  const { data: project, isLoading } = useQuery(['project', id], () => fetchProject(id), { enabled: !!id })
  const { data: profitability } = useQuery(['profitability', id], () => fetchProfitability(id), { enabled: !!id })
  const [amount, setAmount] = useState('')

  const onCreateEvent = async (e: any) => {
    e.preventDefault()
    if (!id) return
    await createEvent({ projectId: id, eventType: 'LABOR_COST', amount: Number(amount) })
    // Simple refetch via router replace
    router.replace(router.asPath)
  }

  return (
    <Layout>
      <div className="container mx-auto p-6">
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">{project?.name}</h2>
            <div className="mt-4">
              <strong>Profitability</strong>
              <div className="mt-2">
                <pre className="bg-gray-100 p-3 rounded">{JSON.stringify(profitability, null, 2)}</pre>
              </div>
            </div>

            <form onSubmit={onCreateEvent} className="mt-6 space-y-3">
              <div>
                <label className="block text-sm font-medium">Amount</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 block w-full border rounded p-2" />
              </div>
              <div>
                <button className="bg-green-600 text-white px-4 py-2 rounded">Create Event</button>
              </div>
            </form>
          </>
        )}
      </div>
    </Layout>
  )
}
