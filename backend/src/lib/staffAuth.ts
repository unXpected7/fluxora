import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Response } from 'express'
import { prisma } from './prisma.js'

const scrypt = promisify(scryptCallback)
const cookieName = 'fluxora_staff'
const sessionSeconds = 8 * 60 * 60
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

export async function hashStaffPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyStaffPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(':')
  if (!salt || !expected || !/^[a-f0-9]{128}$/i.test(expected)) return false
  const derived = await scrypt(password, salt, 64) as Buffer
  const actual = Buffer.from(expected, 'hex')
  return actual.length === derived.length && timingSafeEqual(actual, derived)
}

function readToken(cookieHeader: string | undefined) {
  return cookieHeader?.match(/(?:^|;\s*)fluxora_staff=([^;]+)/)?.[1]
}

export function setStaffCookie(response: Response, token: string) {
  response.append('Set-Cookie', `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionSeconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

export function clearStaffCookie(response: Response) {
  response.append('Set-Cookie', `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
}

export async function createStaffSession(staffId: string) {
  const token = randomBytes(32).toString('base64url')
  await prisma.staffSession.create({ data: { staffId, tokenHash: hash(token), expiresAt: new Date(Date.now() + sessionSeconds * 1000) } })
  return token
}

export async function currentStaff(cookieHeader: string | undefined) {
  const token = readToken(cookieHeader)
  if (!token) return null
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hash(token) },
    include: { staff: { include: { memberships: { where: { active: true }, include: { partner: { select: { id: true, slug: true, name: true, status: true } } } } } } },
  })
  if (!session) return null
  if (session.expiresAt <= new Date() || !session.staff.active) {
    await prisma.staffSession.deleteMany({ where: { id: session.id } })
    return null
  }
  return {
    id: session.staff.id,
    email: session.staff.email,
    role: session.staff.role,
    platformRole: session.staff.platformRole,
    memberships: session.staff.memberships,
  }
}

export async function deleteStaffSession(cookieHeader: string | undefined) {
  const token = readToken(cookieHeader)
  if (token) await prisma.staffSession.deleteMany({ where: { tokenHash: hash(token) } })
}
