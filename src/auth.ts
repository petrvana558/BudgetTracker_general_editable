import { FastifyRequest, FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import jwksRsa from 'jwks-rsa'

const TENANT_ID = process.env.AZURE_TENANT_ID!
const CLIENT_ID = process.env.AZURE_CLIENT_ID!
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN!

if (!TENANT_ID || !CLIENT_ID || !ALLOWED_DOMAIN) {
  console.error('Missing required env vars: AZURE_TENANT_ID, AZURE_CLIENT_ID, ALLOWED_DOMAIN')
  process.exit(1)
}

const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 600000, // 10 minut
})

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(kid, (err, key) => {
      if (err || !key) return reject(err ?? new Error('Key not found'))
      resolve(key.getPublicKey())
    })
  })
}

// Rozšíření FastifyRequest o pole user
declare module 'fastify' {
  interface FastifyRequest {
    user: string
  }
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers['authorization']
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Missing token' })
  }

  const token = authHeader.slice(7)

  try {
    // Dekódujeme header tokenu abychom získali kid
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token format' })
    }

    const signingKey = await getSigningKey(decoded.header.kid)

    const payload = jwt.verify(token, signingKey, {
      audience: CLIENT_ID,
      issuer: [
        `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
        `https://sts.windows.net/${TENANT_ID}/`,
      ],
    }) as jwt.JwtPayload

    // Získat email uživatele (upn nebo preferred_username)
    const userEmail: string =
      (payload['upn'] as string) ||
      (payload['preferred_username'] as string) ||
      (payload['email'] as string) ||
      ''

    if (!userEmail) {
      return reply.code(401).send({ error: 'Unauthorized', message: 'Cannot identify user' })
    }

    // Ověřit doménu
    const domain = userEmail.split('@')[1]?.toLowerCase()
    if (domain !== ALLOWED_DOMAIN.toLowerCase()) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Access denied. Only users from @${ALLOWED_DOMAIN} are allowed.`,
      })
    }

    req.user = userEmail
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token verification failed'
    return reply.code(401).send({ error: 'Unauthorized', message })
  }
}
