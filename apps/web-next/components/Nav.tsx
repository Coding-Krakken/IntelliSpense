import Link from 'next/link'

export default function Nav() {
  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        <Link href="/" className="font-bold text-lg">
          IntelliSpense
        </Link>
        <div className="space-x-4">
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
          <Link href="/login" className="hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  )
}
