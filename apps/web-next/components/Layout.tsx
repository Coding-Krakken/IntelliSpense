import React from 'react'
import Nav from './Nav'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Nav />
      <main>{children}</main>
    </div>
  )
}
