import Layout from '../../components/Layout'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchProjects } from '../../lib/api'

export default function Projects() {
  const { data, isLoading } = useQuery(['projects'], fetchProjects)

  return (
    <Layout>
      <div className="container mx-auto p-6">
        <h2 className="text-2xl font-semibold">Projects</h2>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(data?.projects || []).map((p: any) => (
              <li key={p.id} className="p-3 border rounded">
                <Link href={`/projects/${p.id}`} className="font-medium text-blue-600">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  )
}
