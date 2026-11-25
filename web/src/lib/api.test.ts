import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import { api, ApiError, getAccessToken, setAccessToken } from './api'

describe('api client', () => {
  it('refreshes an expired access token once, even for parallel requests, then retries them', async () => {
    let refreshes = 0
    server.use(
      http.post('*/api/auth/refresh', () => {
        refreshes++
        return HttpResponse.json({
          access_token: 'fresh',
          token_type: 'bearer',
          expires_in: 900,
        })
      }),
      http.get('*/api/orgs/1/projects', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json([])
          : HttpResponse.json(
              { error: { code: 'unauthorized', message: 'expired' } },
              { status: 401 },
            ),
      ),
    )
    setAccessToken('stale')
    const results = await Promise.all([api.projects(1), api.projects(1), api.projects(1)])
    expect(results).toEqual([[], [], []])
    expect(refreshes).toBe(1)
    expect(getAccessToken()).toBe('fresh')
  })

  it('turns the API error shape into an ApiError with field messages', async () => {
    server.use(
      http.post('*/api/orgs/1/projects', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Some fields are invalid',
              fields: { key: 'Bad key' },
            },
          },
          { status: 422 },
        ),
      ),
    )
    const error = await api
      .createProject(1, { name: 'X', key: '1', description: '' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 422,
      code: 'validation_error',
      fields: { key: 'Bad key' },
    })
  })

  it('reports network failures as status 0', async () => {
    server.use(http.get('*/api/orgs/1/stats', () => HttpResponse.error()))
    await expect(api.stats(1)).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    })
  })
})
