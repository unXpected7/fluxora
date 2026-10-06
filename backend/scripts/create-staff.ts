import { hashStaffPassword } from '../src/lib/staffAuth.js'
import { prisma } from '../src/lib/prisma.js'

const email = process.env.FLUXORA_STAFF_EMAIL?.trim().toLowerCase() || ''
const password = process.env.FLUXORA_STAFF_PASSWORD || ''
const requestedRole = (process.env.FLUXORA_STAFF_ROLE || 'GATE') as 'GATE' | 'ADMIN' | 'SUPERADMIN'

try {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Set FLUXORA_STAFF_EMAIL to a valid email address')
  if (password.length < 12 || password.length > 256) throw new Error('Set FLUXORA_STAFF_PASSWORD to a password of 12 to 256 characters')
  if (!['GATE', 'ADMIN', 'SUPERADMIN'].includes(requestedRole)) throw new Error('FLUXORA_STAFF_ROLE must be GATE, ADMIN, or SUPERADMIN')
  const role = requestedRole === 'GATE' ? 'GATE' : 'ADMIN'
  const platformRole = requestedRole === 'SUPERADMIN' ? 'SUPERADMIN' : 'NONE'
  const partner = requestedRole === 'SUPERADMIN' ? null : await prisma.partner.findUnique({ where: { slug: 'fluxora' }, select: { id: true } })
  if (requestedRole !== 'SUPERADMIN' && !partner) throw new Error('Fluxora tenant is missing; apply the partner migrations first')
  const passwordHash = await hashStaffPassword(password)
  const staff = await prisma.$transaction(async transaction => {
    const saved = await transaction.staffUser.upsert({ where: { email }, create: { email, passwordHash, role, platformRole }, update: { passwordHash, active: true, role, platformRole } })
    if (partner) await transaction.partnerMembership.upsert({
      where: { staffId_partnerId: { staffId: saved.id, partnerId: partner.id } },
      create: { staffId: saved.id, partnerId: partner.id, role: requestedRole as 'GATE' | 'ADMIN' },
      update: { role: requestedRole as 'GATE' | 'ADMIN', active: true },
    })
    return saved
  })
  console.log(`Staff account provisioned: ${staff.email} (${staff.id}, ${requestedRole})`)
} finally {
  await prisma.$disconnect()
}
