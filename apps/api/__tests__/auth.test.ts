import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../src/index'

// NOTE: This is a lightweight placeholder test. It asserts that the health endpoint responds.
describe('API basic', () => {
  it('health endpoint', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
