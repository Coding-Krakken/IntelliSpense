import request from 'supertest'
import express from 'express'
import appModule from '../../src/index'

// NOTE: This is a lightweight placeholder test. It asserts that the health endpoint responds.
describe('API basic', () => {
  it('health endpoint', async () => {
    const res = await request('http://localhost:4000').get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
