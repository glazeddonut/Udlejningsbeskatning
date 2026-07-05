// Tynde fetch-hjælpere mod backend-API'et.

async function json(res) {
  if (!res.ok) {
    let msg = `Fejl ${res.status}`
    try { const b = await res.json(); if (b.error) msg = b.error } catch { /* ignore */ }
    throw new Error(msg)
  }
  return res.json()
}

export const api = {
  get: (path) => fetch(`/api${path}`).then(json),
  post: (path, body) => fetch(`/api${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json),
  put: (path, body) => fetch(`/api${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(json),
  del: (path) => fetch(`/api${path}`, { method: 'DELETE' }).then(json),
}
