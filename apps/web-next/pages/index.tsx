import Link from 'next/link'
import Layout from '../components/Layout'

export default function Home() {
  return (
    <Layout>
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold">IntelliSpense</h1>
        <p className="mt-4 text-gray-600">AI-native profitability engine — minimal frontend scaffold.</p>
        <div className="mt-6">
          <Link href="/projects" className="text-blue-600 underline">
            View Projects
          </Link>
        </div>
      </div>
    </Layout>
  )
}
