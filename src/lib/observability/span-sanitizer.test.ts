import { describe, expect, it, vi } from 'vitest'

import {
  SanitizingSpanExporter,
  sanitizeSpan,
  sanitizeSpanAttributes,
  sanitizeSpanName,
} from './span-sanitizer'

import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

describe('sanitizeSpanName', () => {
  it('should mask the invite code carried by a request span name', () => {
    expect(sanitizeSpanName('GET /sessions/7K3M9P')).toBe('GET /sessions/[code]')
    expect(sanitizeSpanName('POST /join/7K3M9P?next=%2Fsessions%2F7K3M9P')).toBe(
      'POST /join/[code]'
    )
  })

  it('should keep a span name that carries no path untouched', () => {
    expect(sanitizeSpanName('render route (app) /[locale]/sessions/[code]')).toBe(
      'render route (app) /[locale]/sessions/[code]'
    )
    expect(sanitizeSpanName('executing api route')).toBe('executing api route')
  })

  it('should strip the query string of an outgoing call', () => {
    expect(
      sanitizeSpanName('fetch GET https://abc.supabase.co/rest/v1/sessions?code=eq.7K3M9P')
    ).toBe('fetch GET https://abc.supabase.co/rest/v1/sessions')
  })
})

describe('sanitizeSpanAttributes', () => {
  it('should mask URL attributes and drop query strings and headers', () => {
    expect(
      sanitizeSpanAttributes({
        'http.method': 'GET',
        'http.target': '/sessions/7K3M9P/results?tab=all',
        'http.url': 'https://places.googleapis.com/v1/places:searchText?key=SECRET',
        'url.full': 'https://www.onmangekoi.fr/l/restos-H4V2Q8ZX0M',
        'url.query': 'code=7K3M9P',
        'http.request.header.cookie': ['sb-access-token=abc'],
        'next.route': '/[locale]/sessions/[code]',
        'http.status_code': 200,
      })
    ).toEqual({
      'http.method': 'GET',
      'http.target': '/sessions/[code]/results',
      'http.url': 'https://places.googleapis.com/v1/places:searchText',
      'url.full': 'https://www.onmangekoi.fr/l/[code]',
      'next.route': '/[locale]/sessions/[code]',
      'http.status_code': 200,
    })
  })
})

describe('sanitizeSpan', () => {
  const original = {
    name: 'GET /join/7K3M9P',
    attributes: { 'http.target': '/join/7K3M9P' },
    events: [{ name: 'exception', time: [0, 0], attributes: { 'url.path': '/sessions/7K3M9P' } }],
    duration: [0, 1_000_000],
  } as unknown as ReadableSpan

  it('should return a masked view and leave the original span untouched', () => {
    const masked = sanitizeSpan(original)

    expect(masked.name).toBe('GET /join/[code]')
    expect(masked.attributes).toEqual({ 'http.target': '/join/[code]' })
    expect(masked.events[0]?.attributes).toEqual({ 'url.path': '/sessions/[code]' })
    // Le reste du span est hérité tel quel.
    expect(masked.duration).toEqual([0, 1_000_000])
    expect(original.name).toBe('GET /join/7K3M9P')
  })

  it('should hand only masked spans to the wrapped exporter', () => {
    const inner: SpanExporter = { export: vi.fn(), shutdown: vi.fn(async () => {}) }
    const callback = vi.fn()

    new SanitizingSpanExporter(inner).export([original], callback)

    const [spans, passedCallback] = vi.mocked(inner.export).mock.calls[0]!
    expect(spans[0]?.name).toBe('GET /join/[code]')
    expect(passedCallback).toBe(callback)
  })
})
