import {
  Boxes,
  BrainCircuit,
  Check,
  Menu,
  ShoppingBag,
  Ticket,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';

type Staff = { id: string; email: string; role: string; platformRole: string; memberships: { partnerId: string; slug: string; name: string; status: string; role: string }[] };
type PartnerItem = { id: string; slug: string; name: string; status: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; contactEmail: string | null; eventCount: number; membershipCount: number };
type TicketTypeItem = { id: string; code: string; name: string; price: number; capacity: number; sold: number; reserved: number; active: boolean; perOrderLimit: number; salesStartAt: string | null; salesEndAt: string | null };
type PerformanceItem = { id: string; name: string; status: string; startsAt: string; endsAt: string; checkInOpensAt: string | null; checkInClosesAt: string | null; ticketTypes: TicketTypeItem[] };
type BundleItem = { id: string; code: string; name: string; price: number; capacity: number | null; sold: number; reserved: number; active: boolean; perOrderLimit: number; salesStartAt: string | null; salesEndAt: string | null; items: { quantity: number; ticketType: { id: string; name: string } }[] };
type EventItem = { id: string; slug: string; title: string; status: string; city: string; venueName: string; startsAt: string; endsAt: string; performances: PerformanceItem[]; bundles: BundleItem[] };
type MembershipItem = { id: string; staffId: string; email: string; staffActive: boolean; role: string; active: boolean; createdAt: string };
type StaffAccountCandidate = { id: string; email: string; membership: { active: boolean; role: string } | null };
type GateAssignmentItem = { id: string; email: string; active: boolean; assignedAt: string };
type PartnerOrderItem = { id: string; orderNumber: string; status: string; paymentStatus: string; createdAt: string; admissions: { ticketId: string; ticketType: string; performance: string; performanceStartsAt: string; status: string; issuedAt: string; checkedInAt: string | null }[] };
type CheckInSnapshot = { total: number; active: number; checkedIn: number; voided: number; refunded: number; performances: { id: string; name: string; startsAt: string; tickets: Record<string, number> }[] };
type PartnerDetail = PartnerItem & { createdAt: string; apiKeyCount: number; webhookCount: number; updatedAt: string };
type AuditItem = { id: string; action: string; entityType: string; entityId: string; createdAt: string; payload: unknown };
type StaffInvitationItem = { id: string; email: string; role: string; expiresAt: string; acceptedAt: string | null; revokedAt: string | null; createdAt: string };
type StoreTicket = { id: string; name: string; description: string | null; price: number; available: number; perOrderLimit: number };
type StoreBundle = { id: string; name: string; description: string | null; price: number; available: number; perOrderLimit: number; items: { quantity: number; ticketType: { name: string } }[] };
export type StoreEvent = { id: string; slug: string; title: string; summary: string | null; description?: string | null; coverImageUrl: string | null; venueName: string; venueAddress?: string | null; city: string; timezone: string; startsAt: string; endsAt: string; performances: { id: string; name: string; startsAt: string; endsAt: string; ticketTypes: StoreTicket[] }[]; bundles: StoreBundle[] };
type CustomerQuote = { id: string; accessToken: string; total: number; expiresAt: string; items: { name: string; quantity: number; unitPrice: number; admissionsPerUnit: number }[] };
type CustomerOrder = { id: string; orderNumber: string; status: string; paymentStatus: string; total: number; payment: { status: string; qrCodeUrl: string | null; qrCodeContent: string | null; expiresAt: string | null } | null; tickets?: { publicId: string; qrToken?: string; status: string; issuedAt: string }[]; ticketDelivery?: { status: string; sentAt: string | null } | null };
type CustomerCheckoutRecovery = { savedAt: number; eventSlug: string; quote: CustomerQuote | null; orderIdempotencyKey: string; order: CustomerOrder | null; orderAccessToken: string };
const CUSTOMER_CHECKOUT_RECOVERY_KEY = 'fluxora-ticket-checkout-v1';

export function ticketingApiUrl(hostname: string, override?: string) {
  if (override) return override;
  if (!hostname.endsWith('.fluxorastudio.id')) return 'http://localhost:4000';
  return hostname.startsWith('dev-') ? 'https://dev-api-eticket.fluxorastudio.id' : 'https://api-eticket.fluxorastudio.id';
}

export function isCustomerStorefrontRoute(hostname: string, pathname: string) {
  return hostname === 'e-ticket.fluxorastudio.id' || hostname.startsWith('dev-e-ticket.') || hostname.includes('ticket-eticket') || hostname.startsWith('ticket.') || pathname === '/tickets' || pathname.startsWith('/event/');
}

function readCustomerCheckoutRecovery(): CustomerCheckoutRecovery | null {
  try {
    const raw = sessionStorage.getItem(CUSTOMER_CHECKOUT_RECOVERY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as CustomerCheckoutRecovery;
    if (!value.savedAt || typeof value.eventSlug !== 'string' || typeof value.orderIdempotencyKey !== 'string' || typeof value.orderAccessToken !== 'string') { sessionStorage.removeItem(CUSTOMER_CHECKOUT_RECOVERY_KEY); return null; }
    return value;
  } catch {
    try { sessionStorage.removeItem(CUSTOMER_CHECKOUT_RECOVERY_KEY); } catch { /* Session storage can be disabled by the browser. */ }
    return null;
  }
}

function customerPaymentStatusMessage(status: string) {
  if (status === 'PAID') return 'Payment confirmed. Your issued tickets are shown below.';
  if (status === 'EXPIRED') return 'This payment expired. Refresh your ticket selection to check availability and start again.';
  if (status === 'FAILED') return 'Payment was not completed. Refresh your ticket selection to try again.';
  if (status === 'REFUND_PENDING') return 'Payment arrived after the ticket reservation ended. The order is under refund review; tickets have not been issued.';
  return 'Payment is pending. Keep this page open or refresh the status to check for confirmation.';
}

export function safeCustomerOrder(order: CustomerOrder): CustomerOrder {
  return { ...order, tickets: order.tickets?.map(ticket => ({ publicId: ticket.publicId, status: ticket.status, issuedAt: ticket.issuedAt })) };
}
const portalKind = window.location.hostname.includes('partner-eticket') || window.location.hostname.startsWith('partner.') ? 'partner' : 'admin';
const backendUrl = ticketingApiUrl(window.location.hostname, import.meta.env.VITE_BACKEND_URL);

function dateTimeInputValue(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formDate(form: FormData, field: string) {
  const value = String(form.get(field) ?? '');
  return value ? new Date(value).toISOString() : undefined;
}

async function staffApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);
  return data as T;
}

function StaffPortal({ staff, onLogout }: { staff: Staff; onLogout: () => Promise<void> }) {
  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [inspectedPartner, setInspectedPartner] = useState<PartnerDetail | null>(null);
  const [ownerCandidates, setOwnerCandidates] = useState<StaffAccountCandidate[]>([]);
  const [ownerStaffId, setOwnerStaffId] = useState('');
  const [ownerSearchEmail, setOwnerSearchEmail] = useState('');
  const [partnerAudit, setPartnerAudit] = useState<AuditItem[]>([]);
  const [auditAction, setAuditAction] = useState('');
  const [staffInvitations, setStaffInvitations] = useState<StaffInvitationItem[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('OWNER');
  const [oneTimeInvitationUrl, setOneTimeInvitationUrl] = useState('');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [gateAssignments, setGateAssignments] = useState<GateAssignmentItem[]>([]);
  const [eventOrders, setEventOrders] = useState<PartnerOrderItem[]>([]);
  const [checkInSnapshot, setCheckInSnapshot] = useState<CheckInSnapshot | null>(null);
  const [ordersOffset, setOrdersOffset] = useState(0);
  const [ordersHaveMore, setOrdersHaveMore] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('EVENT_MANAGER');
  const [staffSearchEmail, setStaffSearchEmail] = useState('');
  const [staffSearchResults, setStaffSearchResults] = useState<StaffAccountCandidate[]>([]);
  const [searchingStaff, setSearchingStaff] = useState(false);
  const [gateStaffId, setGateStaffId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState(staff.memberships.find(item => item.status === 'ACTIVE')?.partnerId ?? '');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventSlug, setEventSlug] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventCity, setEventCity] = useState('');
  const [eventTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventEndsAt, setEventEndsAt] = useState('');
  const [performanceName, setPerformanceName] = useState('');
  const [performanceStartsAt, setPerformanceStartsAt] = useState('');
  const [performanceEndsAt, setPerformanceEndsAt] = useState('');
  const [ticketPerformanceId, setTicketPerformanceId] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [ticketName, setTicketName] = useState('');
  const [ticketPrice, setTicketPrice] = useState('');
  const [ticketCapacity, setTicketCapacity] = useState('');
  const [bundleCode, setBundleCode] = useState('');
  const [bundleName, setBundleName] = useState('');
  const [bundlePrice, setBundlePrice] = useState('');
  const [bundleComponents, setBundleComponents] = useState<{ ticketTypeId: string; quantity: number }[]>([{ ticketTypeId: '', quantity: 1 }]);
  const [quotaItems, setQuotaItems] = useState<{ id: string; keyPrefix: string; name: string; partner: { name: string }; currentMinuteRequests: number; rateLimitPerMinute: number; requestsLastHour: number }[]>([]);
  const [queueSnapshot, setQueueSnapshot] = useState<{ refundReviewOrders: number; overduePendingPayments: number; expiredActiveReservations: number; ticketDelivery: { countsByStatus: Record<string, number> }; partnerWebhookDelivery: { countsByStatus: Record<string, number> } } | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isPlatformAdmin = portalKind === 'admin' && staff.platformRole === 'SUPERADMIN';
  const activeMemberships = staff.memberships.filter(item => item.status === 'ACTIVE');
  const managementMemberships = activeMemberships.filter(item => ['OWNER', 'ADMIN', 'EVENT_MANAGER'].includes(item.role));
  const canManageMembers = isPlatformAdmin || managementMemberships.some(item => item.partnerId === selectedPartnerId && ['OWNER', 'ADMIN'].includes(item.role));
  const canManageGateStaff = isPlatformAdmin || managementMemberships.some(item => item.partnerId === selectedPartnerId);
  const selectedMembership = managementMemberships.find(item => item.partnerId === selectedPartnerId) ?? managementMemberships[0];
  const selectedEvent = events.find(item => item.id === selectedEventId) ?? null;
  const partnerAdminPath = selectedMembership ? `/api/staff/partners/${encodeURIComponent(selectedMembership.partnerId)}/admin` : '';

  async function loadPortal() {
    setLoading(true);
    setError('');
    try {
      if (isPlatformAdmin) {
        const [partnerResponse, quotaResponse, queues] = await Promise.all([
          staffApi<{ items: PartnerItem[] }>('/api/staff/admin/partners?limit=100'),
          staffApi<{ items: typeof quotaItems }>('/api/staff/admin/api-usage?limit=100'),
          staffApi<typeof queueSnapshot>('/api/staff/admin/operations/queues'),
        ]);
        setPartners(partnerResponse.items);
        setQuotaItems(quotaResponse.items);
        setQueueSnapshot(queues);
      } else if (portalKind === 'partner') {
        const selected = managementMemberships.find(item => item.partnerId === selectedPartnerId) ?? managementMemberships[0];
        if (!selected) throw new Error('No active event-management membership is assigned to this account. Gate staff need the check-in workspace.');
        if (selected.partnerId !== selectedPartnerId) setSelectedPartnerId(selected.partnerId);
        const result = await staffApi<{ items: EventItem[] }>(`/api/staff/partners/${encodeURIComponent(selected.partnerId)}/admin/events`);
        setEvents(result.items);
      } else {
        throw new Error('This portal requires a SuperAdmin account.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the ticketing workspace.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPortal(); }, [staff.id, selectedPartnerId]);
  useEffect(() => { setTicketPerformanceId(''); setBundleComponents([{ ticketTypeId: '', quantity: 1 }]); setOrdersOffset(0); setEventOrders([]); setCheckInSnapshot(null); }, [selectedEventId, selectedPartnerId]);

  useEffect(() => {
    if (portalKind !== 'partner' || !partnerAdminPath) return;
    let cancelled = false;
    void staffApi<{ items: MembershipItem[] }>(`${partnerAdminPath}/memberships`).then(result => { if (!cancelled) setMemberships(result.items); }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load partner members.'); });
    return () => { cancelled = true; };
  }, [partnerAdminPath, selectedPartnerId]);

  useEffect(() => {
    if (!selectedEvent || !partnerAdminPath) { setGateAssignments([]); return; }
    let cancelled = false;
    void staffApi<{ items: GateAssignmentItem[] }>(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/gate-staff`).then(result => { if (!cancelled) setGateAssignments(result.items); }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load gate assignments.'); });
    return () => { cancelled = true; };
  }, [partnerAdminPath, selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent || !partnerAdminPath) { setEventOrders([]); setCheckInSnapshot(null); return; }
    let cancelled = false;
    const eventPath = `${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}`;
    void Promise.all([
      staffApi<{ items: PartnerOrderItem[]; hasMore: boolean }>(`${eventPath}/orders?limit=20&offset=${ordersOffset}`),
      ordersOffset === 0 ? staffApi<CheckInSnapshot>(`${eventPath}/check-in-summary`) : Promise.resolve(null),
    ]).then(([orderResult, snapshot]) => {
      if (cancelled) return;
      setEventOrders(items => ordersOffset === 0 ? orderResult.items : [...items, ...orderResult.items]);
      setOrdersHaveMore(orderResult.hasMore);
      if (snapshot) setCheckInSnapshot(snapshot);
    }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load event operations.'); });
    return () => { cancelled = true; };
  }, [partnerAdminPath, selectedEvent?.id, ordersOffset]);

  async function createPartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(''); setNotice('');
    try {
      await staffApi<PartnerItem>('/api/staff/admin/partners', { method: 'POST', body: JSON.stringify({ slug, name, contactEmail: contactEmail || undefined }) });
      setSlug(''); setName(''); setContactEmail(''); setNotice('Partner created with pending status.');
      await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the partner.'); }
    finally { setSaving(false); }
  }

  async function changePartnerStatus(partner: PartnerItem) {
    const status = partner.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setError(''); setNotice('');
    try {
      await staffApi(`/api/staff/admin/partners/${encodeURIComponent(partner.id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setNotice(`${partner.name} is now ${status.toLowerCase()}.`);
      await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update partner status.'); }
  }

  async function inspectPartner(partner: PartnerItem) {
    setError(''); setNotice(''); setInspectedPartner(null); setPartnerAudit([]); setOwnerCandidates([]);
    try {
      const detail = await staffApi<PartnerDetail>(`/api/staff/admin/partners/${encodeURIComponent(partner.id)}`);
      const audit = await staffApi<{ items: AuditItem[] }>(`/api/staff/admin/audit?partnerId=${encodeURIComponent(partner.id)}&limit=10`);
      setInspectedPartner(detail); setPartnerAudit(audit.items);
      const invitations = await staffApi<{ items: StaffInvitationItem[] }>(`/api/staff/admin/partners/${encodeURIComponent(partner.id)}/invitations`);
      setStaffInvitations(invitations.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load partner details.'); }
  }

  async function searchPartnerAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inspectedPartner) return; setError('');
    try {
      const query = new URLSearchParams({ partnerId: inspectedPartner.id, limit: '10' });
      if (auditAction.trim()) query.set('action', auditAction.trim());
      const result = await staffApi<{ items: AuditItem[] }>(`/api/staff/admin/audit?${query}`);
      setPartnerAudit(result.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search partner audit records.'); }
  }

  async function searchOwnerAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inspectedPartner) return; setError('');
    try {
      const query = new URLSearchParams({ email: ownerSearchEmail.trim() });
      const result = await staffApi<{ items: StaffAccountCandidate[] }>(`/api/staff/partners/${encodeURIComponent(inspectedPartner.id)}/admin/staff-accounts?${query}`);
      setOwnerCandidates(result.items);
      if (result.items.length === 0) setNotice('No active staff accounts match that email.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search staff accounts.'); }
  }

  async function assignPartnerOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inspectedPartner || !ownerStaffId) return; setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/owners`, { method: 'POST', body: JSON.stringify({ staffId: ownerStaffId }) });
      setNotice('Partner owner assigned.'); setOwnerStaffId(''); setOwnerCandidates([]);
      const audit = await staffApi<{ items: AuditItem[] }>(`/api/staff/admin/audit?partnerId=${encodeURIComponent(inspectedPartner.id)}&limit=10`);
      setPartnerAudit(audit.items);
      await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assign partner owner.'); }
    finally { setSaving(false); }
  }

  async function createStaffInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inspectedPartner) return; setSaving(true); setError(''); setNotice(''); setOneTimeInvitationUrl('');
    try {
      const created = await staffApi<{ invitationUrl: string }> (`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/invitations`, { method: 'POST', body: JSON.stringify({ email: inviteEmail, role: inviteRole }) });
      setOneTimeInvitationUrl(created.invitationUrl); setInviteEmail('');
      const result = await staffApi<{ items: StaffInvitationItem[] }>(`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/invitations`);
      setStaffInvitations(result.items); setNotice('Invitation created. Copy and deliver the one-time link securely.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create invitation.'); }
    finally { setSaving(false); }
  }

  async function resendStaffInvitation(invitation: StaffInvitationItem) {
    if (!inspectedPartner) return; setSaving(true); setError(''); setOneTimeInvitationUrl('');
    try {
      const resent = await staffApi<{ invitationUrl: string }>(`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/invitations/${encodeURIComponent(invitation.id)}/resend`, { method: 'POST' });
      setOneTimeInvitationUrl(resent.invitationUrl);
      const result = await staffApi<{ items: StaffInvitationItem[] }>(`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/invitations`);
      setStaffInvitations(result.items); setNotice('Previous invitation revoked and replaced. Copy and deliver the new link securely.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend invitation.'); }
    finally { setSaving(false); }
  }

  async function revokeStaffInvitation(invitation: StaffInvitationItem) {
    if (!inspectedPartner) return; setSaving(true); setError('');
    try {
      await staffApi(`/api/staff/admin/partners/${encodeURIComponent(inspectedPartner.id)}/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE' });
      setStaffInvitations(items => items.map(item => item.id === invitation.id ? { ...item, revokedAt: new Date().toISOString() } : item)); setNotice('Invitation revoked.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not revoke invitation.'); }
    finally { setSaving(false); }
  }

  async function submitEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const created = await staffApi<EventItem>(`${partnerAdminPath}/events`, { method: 'POST', body: JSON.stringify({ slug: eventSlug, title: eventTitle, venueName: eventVenue, city: eventCity, timezone: eventTimezone, startsAt: new Date(eventStartsAt).toISOString(), endsAt: new Date(eventEndsAt).toISOString() }) });
      setEventTitle(''); setEventSlug(''); setEventVenue(''); setEventCity(''); setEventStartsAt(''); setEventEndsAt(''); setSelectedEventId(created.id); setNotice('Event created as a draft.');
      await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the event.'); }
    finally { setSaving(false); }
  }

  async function submitPerformance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedEvent) return; setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/performances`, { method: 'POST', body: JSON.stringify({ name: performanceName, startsAt: new Date(performanceStartsAt).toISOString(), endsAt: new Date(performanceEndsAt).toISOString() }) });
      setPerformanceName(''); setPerformanceStartsAt(''); setPerformanceEndsAt(''); setNotice('Performance added.'); await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the performance.'); }
    finally { setSaving(false); }
  }

  async function submitTicketType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!ticketPerformanceId) return; setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/performances/${encodeURIComponent(ticketPerformanceId)}/ticket-types`, { method: 'POST', body: JSON.stringify({ code: ticketCode, name: ticketName, price: Number(ticketPrice), capacity: Number(ticketCapacity) }) });
      setTicketCode(''); setTicketName(''); setTicketPrice(''); setTicketCapacity(''); setNotice('Ticket type added.'); await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the ticket type.'); }
    finally { setSaving(false); }
  }

  async function submitBundle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedEvent) return; setSaving(true); setError(''); setNotice('');
    try {
      const items = bundleComponents.filter(item => item.ticketTypeId);
      if (!items.length) throw new Error('Choose at least one ticket type for the bundle.');
      if (new Set(items.map(item => item.ticketTypeId)).size !== items.length) throw new Error('Each ticket type can appear only once in a bundle.');
      await staffApi(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/bundles`, { method: 'POST', body: JSON.stringify({ code: bundleCode, name: bundleName, price: Number(bundlePrice), items }) });
      setBundleCode(''); setBundleName(''); setBundlePrice(''); setBundleComponents([{ ticketTypeId: '', quantity: 1 }]); setNotice('Bundle added.'); await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the bundle.'); }
    finally { setSaving(false); }
  }

  async function updateCatalogueItem(path: string, event: FormEvent<HTMLFormElement>, label: string) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const field of ['slug', 'title', 'venueName', 'city', 'name', 'code']) {
      const value = form.get(field);
      if (value !== null) body[field] = String(value);
    }
    for (const field of ['price', 'capacity', 'perOrderLimit']) {
      const value = form.get(field);
      if (field === 'capacity' && form.has(field) && String(value ?? '') === '') body[field] = null;
      else if (value !== null && String(value) !== '') body[field] = Number(value);
    }
    for (const field of ['startsAt', 'endsAt']) {
      const value = formDate(form, field);
      if (value) body[field] = value;
    }
    for (const field of ['salesStartAt', 'salesEndAt', 'checkInOpensAt', 'checkInClosesAt']) {
      if (!form.has(field)) continue;
      body[field] = formDate(form, field) ?? null;
    }
    const status = form.get('status');
    if (status !== null) body.status = String(status);
    const active = form.get('active');
    if (active !== null) body.active = active === 'true';
    try {
      await staffApi(path, { method: 'PATCH', body: JSON.stringify(body) });
      setNotice(`${label} updated.`);
      await loadPortal();
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not update ${label.toLowerCase()}.`); }
    finally { setSaving(false); }
  }

  async function saveMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/memberships/${encodeURIComponent(newStaffId.trim())}`, { method: 'PUT', body: JSON.stringify({ role: newStaffRole }) });
      setNewStaffId('');
      const result = await staffApi<{ items: MembershipItem[] }>(`${partnerAdminPath}/memberships`);
      setMemberships(result.items); setStaffSearchResults([]); setNewStaffId(''); setNotice('Partner membership saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save partner membership.'); }
    finally { setSaving(false); }
  }

  async function searchStaffAccounts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSearchingStaff(true); setError('');
    try {
      const query = new URLSearchParams({ email: staffSearchEmail.trim() });
      const result = await staffApi<{ items: StaffAccountCandidate[] }>(`${partnerAdminPath}/staff-accounts?${query}`);
      setStaffSearchResults(result.items);
      if (result.items.length === 0) setNotice('No active staff accounts match that email.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not search staff accounts.'); }
    finally { setSearchingStaff(false); }
  }

  async function deactivateMembership(member: MembershipItem) {
    setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/memberships/${encodeURIComponent(member.staffId)}`, { method: 'DELETE' });
      const result = await staffApi<{ items: MembershipItem[] }>(`${partnerAdminPath}/memberships`);
      setMemberships(result.items); setNotice(`${member.email} was removed from this partner.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not deactivate membership.'); }
    finally { setSaving(false); }
  }

  async function assignGateStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedEvent || !gateStaffId) return; setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/gate-staff`, { method: 'POST', body: JSON.stringify({ staffId: gateStaffId }) });
      const result = await staffApi<{ items: GateAssignmentItem[] }>(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/gate-staff`);
      setGateAssignments(result.items); setGateStaffId(''); setNotice('Gate staff assigned to this event.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assign gate staff.'); }
    finally { setSaving(false); }
  }

  async function removeGateStaff(member: GateAssignmentItem) {
    if (!selectedEvent) return; setSaving(true); setError(''); setNotice('');
    try {
      await staffApi(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}/gate-staff/${encodeURIComponent(member.id)}`, { method: 'DELETE' });
      setGateAssignments(items => items.filter(item => item.id !== member.id)); setNotice(`${member.email} was removed from this event's gate team.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove gate assignment.'); }
    finally { setSaving(false); }
  }

  function loadMoreOrders() { setOrdersOffset(offset => offset + 20); }
  return (
    <main className="portal-page">
      <header className="portal-header">
        <a className="staff-login-brand" href="/" aria-label="Fluxora Studio home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">fluxora<span>studio</span></span></a>
        <div className="portal-user"><span>{staff.email}</span><button type="button" className="portal-quiet-button" onClick={() => void onLogout()}>Sign out</button></div>
      </header>
      <section className="portal-content">
        <div className="portal-heading">
          <div><p className="eyebrow"><span /> FLUXORA TICKETING</p><h1>{isPlatformAdmin ? 'Platform overview' : 'Partner workspace'}</h1><p>{isPlatformAdmin ? 'Manage event partners and review API operations.' : 'Review your events and ticket catalogue.'}</p></div>
          {!isPlatformAdmin && managementMemberships.length > 1 && <label className="portal-select-label">Partner<select value={selectedMembership?.partnerId ?? ''} onChange={event => setSelectedPartnerId(event.target.value)}>{managementMemberships.map(item => <option value={item.partnerId} key={item.partnerId}>{item.name} · {item.role.toLowerCase()}</option>)}</select></label>}
        </div>
        {error && <p className="portal-alert" role="alert">{error}</p>}{notice && <p className="portal-notice" role="status">{notice}</p>}
        {loading ? <p className="portal-muted">Loading ticketing data…</p> : isPlatformAdmin ? <>
          <div className="portal-metrics">
            <article><span>PARTNERS</span><strong>{partners.length}</strong><small>Across all statuses</small></article>
            <article><span>API KEYS</span><strong>{quotaItems.length}</strong><small>{quotaItems.filter(item => item.currentMinuteRequests >= item.rateLimitPerMinute).length} at or above minute limit</small></article>
            <article><span>REFUND REVIEW</span><strong>{queueSnapshot?.refundReviewOrders ?? 0}</strong><small>Orders needing operator review</small></article>
            <article><span>OVERDUE</span><strong>{(queueSnapshot?.overduePendingPayments ?? 0) + (queueSnapshot?.expiredActiveReservations ?? 0)}</strong><small>Payments and inventory holds</small></article>
            <article><span>TICKET EMAIL</span><strong>{queueSnapshot?.ticketDelivery.countsByStatus.PENDING ?? 0}</strong><small>{queueSnapshot?.ticketDelivery.countsByStatus.FAILED ?? 0} failed deliveries</small></article>
            <article><span>PARTNER WEBHOOKS</span><strong>{queueSnapshot?.partnerWebhookDelivery.countsByStatus.PENDING ?? 0}</strong><small>{queueSnapshot?.partnerWebhookDelivery.countsByStatus.FAILED ?? 0} failed deliveries</small></article>
          </div>
          <div className="portal-columns">
            <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">TENANTS</p><h2>Event partners</h2></div><button type="button" className="portal-quiet-button" onClick={() => void loadPortal()}>Refresh</button></div>
              <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Partner</th><th>Status</th><th>Events</th><th>Members</th><th /></tr></thead><tbody>{partners.map(partner => <tr key={partner.id}><td><strong>{partner.name}</strong><small>{partner.slug}</small></td><td><span className={`portal-status portal-status-${partner.status.toLowerCase()}`}>{partner.status}</span></td><td>{partner.eventCount}</td><td>{partner.membershipCount}</td><td><button type="button" className="portal-link-button" onClick={() => void inspectPartner(partner)}>Details</button><button type="button" className="portal-link-button" onClick={() => void changePartnerStatus(partner)}>{partner.status === 'ACTIVE' ? 'Suspend' : 'Activate'}</button></td></tr>)}</tbody></table>{partners.length === 0 && <p className="portal-empty">No partners yet.</p>}</div>
            </section>
            <section className="portal-panel"><p className="eyebrow">ONBOARDING</p><h2>Add a partner</h2><form className="portal-form" onSubmit={createPartner}><label>Partner name<input required maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label><label>URL slug<input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} /></label><label>Contact email <span>(optional)</span><input type="email" maxLength={254} value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create pending partner'}</button></form></section>
          </div>
          {inspectedPartner && <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">PARTNER DETAILS</p><h2>{inspectedPartner.name}</h2><small>{inspectedPartner.slug} · {inspectedPartner.status}</small></div><button type="button" className="portal-quiet-button" onClick={() => setInspectedPartner(null)}>Close</button></div><p>{inspectedPartner.contactEmail || 'No contact email'} · {inspectedPartner.eventCount} events · {inspectedPartner.membershipCount} memberships · {inspectedPartner.apiKeyCount} API keys · {inspectedPartner.webhookCount} webhooks</p><form className="portal-form portal-member-search" onSubmit={searchOwnerAccounts}><label>Find active staff by email<input required minLength={3} maxLength={254} value={ownerSearchEmail} onChange={event => setOwnerSearchEmail(event.target.value)} placeholder="Search owner account" /></label><button className="button button-primary staff-submit" type="submit">Search owners</button></form>{ownerCandidates.length > 0 && <form className="portal-form portal-member-form" onSubmit={assignPartnerOwner}><label>Staff account<select required value={ownerStaffId} onChange={event => setOwnerStaffId(event.target.value)}><option value="">Select account</option>{ownerCandidates.map(account => <option value={account.id} key={account.id}>{account.email}</option>)}</select></label><span>Assigns the SuperAdmin-controlled OWNER role.</span><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Assigning…' : 'Assign owner'}</button></form>}<h3>Staff invitations</h3><form className="portal-form portal-member-form" onSubmit={createStaffInvitation}><label>Invite email<input required type="email" maxLength={254} value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} /></label><label>Partner role<select value={inviteRole} onChange={event => setInviteRole(event.target.value)}><option value="OWNER">Owner</option><option value="ADMIN">Partner admin</option><option value="EVENT_MANAGER">Event manager</option><option value="GATE">Gate staff</option></select></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? "Creating…" : "Create invitation"}</button></form>{oneTimeInvitationUrl && <div className="portal-invitation-link"><label>One-time invitation link<input readOnly value={oneTimeInvitationUrl} /></label><button type="button" className="portal-quiet-button" onClick={() => void navigator.clipboard.writeText(oneTimeInvitationUrl)}>Copy link</button><p className="portal-form-note">Deliver this link securely. It is shown only once and expires in seven days.</p></div>}<div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Status</th><th /></tr></thead><tbody>{staffInvitations.map(invitation => <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role}</td><td>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invitation.expiresAt))}</td><td>{invitation.acceptedAt ? "Accepted" : invitation.revokedAt ? "Revoked" : new Date(invitation.expiresAt) <= new Date() ? "Expired" : "Pending"}</td><td>{!invitation.acceptedAt && !invitation.revokedAt && <><button type="button" className="portal-link-button" disabled={saving} onClick={() => void resendStaffInvitation(invitation)}>Resend</button><button type="button" className="portal-link-button" disabled={saving} onClick={() => void revokeStaffInvitation(invitation)}>Revoke</button></>}</td></tr>)}</tbody></table>{staffInvitations.length === 0 && <p className="portal-empty">No invitations for this partner.</p>}</div><form className="portal-form portal-member-search" onSubmit={searchPartnerAudit}><label>Filter actions by text<input value={auditAction} onChange={event => setAuditAction(event.target.value)} placeholder="e.g. event.updated" /></label><button className="button button-primary staff-submit" type="submit">Search audit</button></form><h3>Partner audit records</h3><div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Action</th><th>Entity</th><th>Time</th></tr></thead><tbody>{partnerAudit.map(item => <tr key={item.id}><td>{item.action}</td><td>{item.entityType} · {item.entityId}</td><td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</td></tr>)}</tbody></table>{partnerAudit.length === 0 && <p className="portal-empty">No audit records found.</p>}</div></section>}
          <section className="portal-panel portal-quota-panel"><div className="portal-panel-heading"><div><p className="eyebrow">INTEGRATIONS</p><h2>API quota activity</h2></div></div><div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Partner / key</th><th>Current minute</th><th>Previous hour</th><th>Quota</th></tr></thead><tbody>{quotaItems.slice(0, 8).map(item => <tr key={item.id}><td><strong>{item.partner.name}</strong><small>{item.name} · {item.keyPrefix}</small></td><td>{item.currentMinuteRequests}</td><td>{item.requestsLastHour}</td><td>{item.rateLimitPerMinute}/min</td></tr>)}</tbody></table>{quotaItems.length === 0 && <p className="portal-empty">No API keys have usage yet.</p>}</div></section>
        </> : <>
          <div className="portal-columns">
            <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">EVENT CATALOGUE</p><h2>{selectedMembership?.name ?? 'Your events'}</h2></div><button type="button" className="portal-quiet-button" onClick={() => void loadPortal()}>Refresh</button></div>
              <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Event</th><th>Status</th><th>Performances</th><th>Tickets</th><th>Bundles</th><th>Starts</th><th /></tr></thead><tbody>{events.map(event => <tr key={event.id}><td><strong>{event.title}</strong><small>{event.slug} · {event.city}</small></td><td><span className={`portal-status portal-status-${event.status.toLowerCase()}`}>{event.status}</span></td><td>{event.performances.length}</td><td>{event.performances.reduce((count, performance) => count + performance.ticketTypes.length, 0)}</td><td>{event.bundles.length}</td><td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(event.startsAt))}</td><td><button type="button" className="portal-link-button" onClick={() => setSelectedEventId(event.id)}>{selectedEventId === event.id ? 'Selected' : 'Manage'}</button></td></tr>)}</tbody></table>{events.length === 0 && <p className="portal-empty">No events have been created for this partner yet.</p>}</div>
            </section>
            <section className="portal-panel"><p className="eyebrow">NEW EVENT</p><h2>Create an event</h2><p className="portal-form-note">Event dates use your device timezone: {eventTimezone}.</p><form className="portal-form" onSubmit={submitEvent}><label>Event name<input required maxLength={200} value={eventTitle} onChange={event => setEventTitle(event.target.value)} /></label><label>Public slug<input required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={eventSlug} onChange={event => setEventSlug(event.target.value.toLowerCase())} /></label><label>Venue<input required maxLength={200} value={eventVenue} onChange={event => setEventVenue(event.target.value)} /></label><label>City<input required maxLength={200} value={eventCity} onChange={event => setEventCity(event.target.value)} /></label><label>Event starts<input required type="datetime-local" value={eventStartsAt} onChange={event => setEventStartsAt(event.target.value)} /></label><label>Event ends<input required type="datetime-local" value={eventEndsAt} onChange={event => setEventEndsAt(event.target.value)} /></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create draft event'}</button></form></section>
          </div>
          <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">TEAM ACCESS</p><h2>Partner members</h2></div></div>
            {canManageMembers ? <><form className="portal-form portal-member-search" onSubmit={searchStaffAccounts}><label>Find an existing staff account by email<input required type="text" inputMode="email" minLength={3} maxLength={254} value={staffSearchEmail} onChange={event => setStaffSearchEmail(event.target.value)} placeholder="Search email" /></label><button className="button button-primary staff-submit" type="submit" disabled={searchingStaff}>{searchingStaff ? 'Searching…' : 'Search accounts'}</button></form>{staffSearchResults.length > 0 && <form className="portal-form portal-member-form" onSubmit={saveMembership}><label>Staff account<select required value={newStaffId} onChange={event => setNewStaffId(event.target.value)}><option value="">Select account</option>{staffSearchResults.map(account => <option key={account.id} value={account.id}>{account.email}{account.membership ? ` · existing ${account.membership.active ? account.membership.role.toLowerCase() : 'inactive membership'}` : ''}</option>)}</select></label><label>Partner role<select value={newStaffRole} onChange={event => setNewStaffRole(event.target.value)}><option value="EVENT_MANAGER">Event manager</option><option value="ADMIN">Partner admin</option><option value="GATE">Gate staff</option>{isPlatformAdmin && <option value="OWNER">Owner (SuperAdmin only)</option>}</select></label><button className="button button-primary staff-submit" type="submit" disabled={saving || !newStaffId}>{saving ? 'Saving…' : 'Add or update member'}</button></form>}</> : <p className="portal-form-note">Only partner owners and administrators can search staff accounts or change partner membership.</p>}
            <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Email</th><th>Role</th><th>Account</th><th>Membership</th><th /></tr></thead><tbody>{memberships.map(member => <tr key={member.id}><td>{member.email}</td><td>{member.role.replace('_', ' ')}</td><td>{member.staffActive ? 'Active' : 'Disabled'}</td><td>{member.active ? 'Active' : 'Inactive'}</td><td>{canManageMembers && member.active && <button type="button" className="portal-link-button" disabled={saving} onClick={() => void deactivateMembership(member)}>Remove</button>}</td></tr>)}</tbody></table>{memberships.length === 0 && <p className="portal-empty">No partner memberships found.</p>}</div>
          </section>
          {selectedEvent && <>
            <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">SELECTED EVENT</p><h2>{selectedEvent.title}</h2><small>{selectedEvent.venueName} · {selectedEvent.city} · {selectedEvent.status}</small></div><button type="button" className="portal-quiet-button" onClick={() => setSelectedEventId('')}>Close</button></div>
              <form key={`event-${selectedEvent.id}`} className="portal-form portal-edit-form" onSubmit={event => void updateCatalogueItem(`${partnerAdminPath}/events/${encodeURIComponent(selectedEvent.id)}`, event, 'Event')}><div className="portal-form-heading"><strong>Edit event</strong><span>Archiving removes it from the public catalogue.</span></div><label>Event name<input required name="title" defaultValue={selectedEvent.title} /></label><label>Public slug<input required name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={selectedEvent.slug} /></label><label>Venue<input required name="venueName" defaultValue={selectedEvent.venueName} /></label><label>City<input required name="city" defaultValue={selectedEvent.city} /></label><label>Starts<input required type="datetime-local" name="startsAt" defaultValue={dateTimeInputValue(selectedEvent.startsAt)} /></label><label>Ends<input required type="datetime-local" name="endsAt" defaultValue={dateTimeInputValue(selectedEvent.endsAt)} /></label><label>Status<select name="status" defaultValue={selectedEvent.status}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save event'}</button></form>
              <div className="portal-subsection"><strong>Event gate team</strong>{canManageGateStaff && <form className="portal-form portal-gate-form" onSubmit={assignGateStaff}><label>Active gate member<select required value={gateStaffId} onChange={event => setGateStaffId(event.target.value)}><option value="">Select gate member</option>{memberships.filter(member => member.active && member.staffActive && member.role === 'GATE' && !gateAssignments.some(assigned => assigned.id === member.staffId)).map(member => <option key={member.staffId} value={member.staffId}>{member.email}</option>)}</select></label><button type="submit" className="button button-primary staff-submit" disabled={saving || !gateStaffId}>{saving ? 'Saving…' : 'Assign to event'}</button></form>}<ul>{gateAssignments.map(member => <li key={member.id}><span>{member.email} <small>{member.active ? 'Active account' : 'Disabled account'}</small></span>{canManageGateStaff && <button type="button" className="portal-link-button" disabled={saving} onClick={() => void removeGateStaff(member)}>Remove</button>}</li>)}</ul>{gateAssignments.length === 0 && <p className="portal-empty">No gate staff assigned to this event.</p>}</div>
              {selectedEvent.performances.map(performance => <div className="portal-subsection" key={performance.id}><div><strong>{performance.name}</strong><span>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(performance.startsAt))} · {performance.status}</span></div><form className="portal-form portal-edit-form" onSubmit={event => void updateCatalogueItem(`${partnerAdminPath}/performances/${encodeURIComponent(performance.id)}`, event, 'Performance')}><label>Performance name<input required name="name" defaultValue={performance.name} /></label><label>Starts<input required type="datetime-local" name="startsAt" defaultValue={dateTimeInputValue(performance.startsAt)} /></label><label>Ends<input required type="datetime-local" name="endsAt" defaultValue={dateTimeInputValue(performance.endsAt)} /></label><label>Check-in opens<input type="datetime-local" name="checkInOpensAt" defaultValue={performance.checkInOpensAt ? dateTimeInputValue(performance.checkInOpensAt) : ''} /></label><label>Check-in closes<input type="datetime-local" name="checkInClosesAt" defaultValue={performance.checkInClosesAt ? dateTimeInputValue(performance.checkInClosesAt) : ''} /></label><label>Status<select name="status" defaultValue={performance.status}><option value="DRAFT">Draft</option><option value="ON_SALE">On sale</option><option value="PAUSED">Paused</option><option value="CLOSED">Closed</option></select></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save performance'}</button></form><ul>{performance.ticketTypes.map(ticket => <li key={ticket.id}><span>{ticket.name} <small>{ticket.code}</small></span><span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(ticket.price)} · {ticket.sold + ticket.reserved}/{ticket.capacity}</span></li>)}</ul>{performance.ticketTypes.map(ticket => <form key={`ticket-${ticket.id}`} className="portal-form portal-edit-form" onSubmit={event => void updateCatalogueItem(`${partnerAdminPath}/ticket-types/${encodeURIComponent(ticket.id)}`, event, 'Ticket type')}><strong>Edit {ticket.name}</strong><label>Ticket name<input required name="name" defaultValue={ticket.name} /></label><label>Code<input required name="code" defaultValue={ticket.code} /></label><label>Price (IDR)<input required type="number" min="0" max="100000000" name="price" defaultValue={ticket.price} /></label><label>Capacity<input required type="number" min={Math.max(1, ticket.sold + ticket.reserved)} max="1000000" name="capacity" defaultValue={ticket.capacity} /></label><label>Per-order limit<input required type="number" min="1" max="100" name="perOrderLimit" defaultValue={ticket.perOrderLimit} /></label><label>Sales start<input type="datetime-local" name="salesStartAt" defaultValue={ticket.salesStartAt ? dateTimeInputValue(ticket.salesStartAt) : ''} /></label><label>Sales end<input type="datetime-local" name="salesEndAt" defaultValue={ticket.salesEndAt ? dateTimeInputValue(ticket.salesEndAt) : ''} /></label><label>Sales status<select name="active" defaultValue={String(ticket.active)}><option value="true">Active</option><option value="false">Paused</option></select></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save ticket type'}</button></form>)}</div>)}
              {selectedEvent.bundles.length > 0 && <div className="portal-subsection"><strong>Bundles</strong><ul>{selectedEvent.bundles.map(bundle => <li key={bundle.id}><span>{bundle.name} <small>{bundle.items.map(item => `${item.quantity} × ${item.ticketType.name}`).join(', ')}</small></span><span>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(bundle.price)} · {bundle.active ? 'Active' : 'Paused'}</span></li>)}</ul>{selectedEvent.bundles.map(bundle => <form key={`bundle-${bundle.id}`} className="portal-form portal-edit-form" onSubmit={event => void updateCatalogueItem(`${partnerAdminPath}/bundles/${encodeURIComponent(bundle.id)}`, event, 'Bundle')}><strong>Edit {bundle.name}</strong><label>Bundle name<input required name="name" defaultValue={bundle.name} /></label><label>Code<input required name="code" defaultValue={bundle.code} /></label><label>Price (IDR)<input required type="number" min="0" max="100000000" name="price" defaultValue={bundle.price} /></label><label>Capacity <span>(leave blank for unlimited)</span><input type="number" min={Math.max(1, bundle.sold + bundle.reserved)} max="1000000" name="capacity" defaultValue={bundle.capacity ?? ''} /></label><label>Per-order limit<input required type="number" min="1" max="100" name="perOrderLimit" defaultValue={bundle.perOrderLimit} /></label><label>Sales start<input type="datetime-local" name="salesStartAt" defaultValue={bundle.salesStartAt ? dateTimeInputValue(bundle.salesStartAt) : ''} /></label><label>Sales end<input type="datetime-local" name="salesEndAt" defaultValue={bundle.salesEndAt ? dateTimeInputValue(bundle.salesEndAt) : ''} /></label><label>Sales status<select name="active" defaultValue={String(bundle.active)}><option value="true">Active</option><option value="false">Paused</option></select></label><p className="portal-form-note">Included tickets are fixed after creation so existing order snapshots remain valid.</p><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save bundle'}</button></form>)}</div>}
            </section>
            <section className="portal-panel"><div className="portal-panel-heading"><div><p className="eyebrow">EVENT OPERATIONS</p><h2>Check-in and orders</h2></div></div>{checkInSnapshot && <div className="portal-metrics"><article><span>ADMISSIONS</span><strong>{checkInSnapshot.total}</strong><small>{checkInSnapshot.active} active</small></article><article><span>CHECKED IN</span><strong>{checkInSnapshot.checkedIn}</strong><small>{checkInSnapshot.voided} void · {checkInSnapshot.refunded} refunded</small></article></div>}{checkInSnapshot?.performances.map(performance => <p className="portal-form-note" key={performance.id}>{performance.name}: {Object.entries(performance.tickets).map(([status, count]) => `${status.toLowerCase()} ${count}`).join(' · ')}</p>)}<div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Order</th><th>Status</th><th>Admissions</th><th>Created</th></tr></thead><tbody>{eventOrders.map(order => <tr key={order.id}><td><strong>{order.orderNumber}</strong><small>Payment: {order.paymentStatus}</small></td><td>{order.status}</td><td>{order.admissions.map(ticket => <span className="portal-order-admission" key={ticket.ticketId}>{ticket.ticketType} · {ticket.performance} · {ticket.status}{ticket.checkedInAt ? ' · checked in' : ''}</span>)}</td><td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.createdAt))}</td></tr>)}</tbody></table>{eventOrders.length === 0 && <p className="portal-empty">No issued admissions for this event yet.</p>}{ordersHaveMore && <button type="button" className="portal-quiet-button" disabled={loading} onClick={loadMoreOrders}>Load more</button>}<p className="portal-form-note">This view excludes buyer contact details and QR credentials.</p></div></section>
            <div className="portal-columns">
              <section className="portal-panel"><p className="eyebrow">SCHEDULE</p><h2>Add a performance</h2><form className="portal-form" onSubmit={submitPerformance}><label>Performance name<input required value={performanceName} onChange={event => setPerformanceName(event.target.value)} /></label><label>Starts<input required type="datetime-local" value={performanceStartsAt} onChange={event => setPerformanceStartsAt(event.target.value)} /></label><label>Ends<input required type="datetime-local" value={performanceEndsAt} onChange={event => setPerformanceEndsAt(event.target.value)} /></label><button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add performance'}</button></form></section>
              <section className="portal-panel"><p className="eyebrow">BUNDLE OFFER</p><h2>Create a bundle</h2><form className="portal-form" onSubmit={submitBundle}><label>Bundle name<input required value={bundleName} onChange={event => setBundleName(event.target.value)} /></label><label>Bundle code<input required maxLength={60} value={bundleCode} onChange={event => setBundleCode(event.target.value.toUpperCase())} /></label><label>Bundle price (IDR)<input required type="number" min="0" max="100000000" value={bundlePrice} onChange={event => setBundlePrice(event.target.value)} /></label><fieldset className="portal-component-list"><legend>Included ticket types</legend>{bundleComponents.map((component, index) => <div className="portal-component-row" key={index}><select required aria-label={`Bundle ticket type ${index + 1}`} value={component.ticketTypeId} onChange={event => setBundleComponents(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ticketTypeId: event.target.value } : item))}><option value="">Select ticket type</option>{selectedEvent.performances.flatMap(performance => performance.ticketTypes.map(ticket => <option value={ticket.id} key={ticket.id}>{performance.name} · {ticket.name}</option>))}</select><input aria-label={`Quantity of ticket type ${index + 1}`} type="number" min="1" max="100" required value={component.quantity} onChange={event => setBundleComponents(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /></div>)}<button type="button" className="portal-link-button" onClick={() => setBundleComponents(items => [...items, { ticketTypeId: '', quantity: 1 }])}>Add another component</button></fieldset><button className="button button-primary staff-submit" type="submit" disabled={saving || selectedEvent.performances.every(performance => performance.ticketTypes.length === 0)}>{saving ? 'Saving…' : 'Create bundle'}</button></form></section>
            </div>
            <section className="portal-panel"><p className="eyebrow">TICKET INVENTORY</p><h2>Add a ticket type</h2><form className="portal-form portal-ticket-form" onSubmit={submitTicketType}><label>Performance<select required value={ticketPerformanceId} onChange={event => setTicketPerformanceId(event.target.value)}><option value="">Select performance</option>{selectedEvent.performances.map(performance => <option value={performance.id} key={performance.id}>{performance.name}</option>)}</select></label><label>Ticket name<input required value={ticketName} onChange={event => setTicketName(event.target.value)} /></label><label>Code<input required maxLength={60} value={ticketCode} onChange={event => setTicketCode(event.target.value.toUpperCase())} /></label><label>Price (IDR)<input required type="number" min="0" max="100000000" value={ticketPrice} onChange={event => setTicketPrice(event.target.value)} /></label><label>Capacity<input required type="number" min="1" max="1000000" value={ticketCapacity} onChange={event => setTicketCapacity(event.target.value)} /></label><button className="button button-primary staff-submit" type="submit" disabled={saving || selectedEvent.performances.length === 0}>{saving ? 'Saving…' : 'Add ticket type'}</button></form></section>
          </>}
        </>}
      </section>
    </main>
  );
}

function StaffLogin() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`${backendUrl}/api/staff/auth/session`, { credentials: 'include' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => setStaff(data?.staff ?? null))
      .catch(() => setError('Could not connect to the backend. Make sure it is running on port 4000.'))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/api/staff/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Sign in failed. Check your email and password.');
      setStaff(data.staff);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to the backend.');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch(`${backendUrl}/api/staff/auth/logout`, { method: 'POST', credentials: 'include' });
    setStaff(null);
  }

  if (staff) return <StaffPortal staff={staff} onLogout={logout} />;

  return (
    <main className="staff-login-page">
      <a className="staff-login-brand" href="/" aria-label="Fluxora Studio home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">fluxora<span>studio</span></span></a>
      <section className="staff-login-card" aria-labelledby="staff-login-title">
        <p className="eyebrow"><span /> FLUXORA TICKETING</p>
        <>
          <h1 id="staff-login-title">{portalKind === 'admin' ? 'Admin sign in' : 'Partner sign in'}</h1>
          <p className="staff-login-intro">Sign in to your Fluxora ticketing {portalKind} account.</p>
          <form className="staff-login-form" onSubmit={submit}>
            <label htmlFor="staff-email">Email</label>
            <input id="staff-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
            <label htmlFor="staff-password">Password</label>
            <input id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
            {error && <p className="staff-login-error" role="alert">{error}</p>}
            <button className="button button-primary staff-submit" type="submit" disabled={submitting || loading}>{submitting ? 'Signing in…' : loading ? 'Checking session…' : 'Sign in'}</button>
          </form>
          <p className="staff-login-note">Staff accounts are created through invitations or by a system administrator.</p>
        </>
      </section>
      <p className="staff-login-footer">FLUXORA STUDIO <span>·</span> TICKETING OPERATIONS</p>
    </main>
  );
}

export function CustomerEventCatalogue({ events, money, lowestPrice }: { events: StoreEvent[]; money: (amount: number) => string; lowestPrice: (event: StoreEvent) => number | null }) {
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('soonest');
  const cities = [...new Set(events.map(event => event.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const now = Date.now();
  const shownEvents = events.filter(event => {
    const withinDate = dateFilter === 'all' || new Date(event.startsAt).getTime() <= now + Number(dateFilter) * 24 * 60 * 60 * 1000;
    return withinDate && (!cityFilter || event.city === cityFilter) && `${event.title} ${event.city} ${event.venueName}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => sortOrder === 'price'
    ? (lowestPrice(a) ?? Number.MAX_SAFE_INTEGER) - (lowestPrice(b) ?? Number.MAX_SAFE_INTEGER)
    : sortOrder === 'name' ? a.title.localeCompare(b.title) : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  return <>
    <p>Discover upcoming live events and book tickets directly with Fluxora Tickets.</p>
    <div className="ticket-catalogue-controls">
      <label>Search events<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Artist, event, venue, or city" /></label>
      <label>City<select value={cityFilter} onChange={event => setCityFilter(event.target.value)}><option value="">All cities</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></label>
      <label>Date<select value={dateFilter} onChange={event => setDateFilter(event.target.value)}><option value="all">Any upcoming date</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option></select></label>
      <label>Sort by<select value={sortOrder} onChange={event => setSortOrder(event.target.value)}><option value="soonest">Soonest</option><option value="price">Lowest price</option><option value="name">Event name</option></select></label>
    </div>
    <section className="ticket-event-grid" aria-label="Available events">
      {shownEvents.map(event => <a className="ticket-event-card" href={`/event/${encodeURIComponent(event.slug)}`} key={event.id}>
        {event.coverImageUrl ? <img src={event.coverImageUrl} alt={`${event.title} event artwork`} loading="lazy" /> : <div className="ticket-event-card-image-fallback" aria-hidden="true"><span>{event.title}</span></div>}
        <div><p className="eyebrow">{event.city}</p><h2>{event.title}</h2>
          <p>{event.venueName} · {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: event.timezone }).format(new Date(event.startsAt))}{event.endsAt !== event.startsAt ? ` – ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: event.timezone }).format(new Date(event.endsAt))}` : ''}</p>
          <span>{event.performances.reduce((count, performance) => count + performance.ticketTypes.length, 0)} ticket types · {event.bundles.length} bundles</span>
          {lowestPrice(event) !== null && <strong className="ticket-starting-price">From {money(lowestPrice(event)!)}</strong>}
          <span className="ticket-card-action">View tickets →</span>
        </div>
      </a>)}
      {shownEvents.length === 0 && <p>{events.length ? 'No events match those filters.' : 'No events are on sale right now. Please check back soon.'}</p>}
    </section>
  </>;
}

function TicketStorefront() {
  const routeEventSlug = window.location.pathname.startsWith('/event/') ? decodeURIComponent(window.location.pathname.slice('/event/'.length)) : '';
  const storedRecovery = readCustomerCheckoutRecovery();
  const recovery = !routeEventSlug || storedRecovery?.eventSlug === routeEventSlug ? storedRecovery : null;
  const eventSlug = routeEventSlug || (recovery?.quote || recovery?.order ? recovery.eventSlug : '');
  const [events, setEvents] = useState<StoreEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<StoreEvent | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '' });
  const [quote, setQuote] = useState<CustomerQuote | null>(() => recovery?.quote ?? null);
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState(() => recovery?.orderIdempotencyKey ?? '');
  const [order, setOrder] = useState<CustomerOrder | null>(() => recovery?.order ?? null);
  const [orderAccessToken, setOrderAccessToken] = useState(() => recovery?.orderAccessToken ?? '');
  const [countdownNow, setCountdownNow] = useState(Date.now());
  const [catalogueRetry, setCatalogueRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const api = backendUrl;
  const money = (amount: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || `Request failed (${response.status})`);
    return data as T;
  };

  useEffect(() => {
    try {
      if (!quote && !order) { sessionStorage.removeItem(CUSTOMER_CHECKOUT_RECOVERY_KEY); return; }
      sessionStorage.setItem(CUSTOMER_CHECKOUT_RECOVERY_KEY, JSON.stringify({ savedAt: Date.now(), eventSlug, quote, orderIdempotencyKey, order: order ? safeCustomerOrder(order) : null, orderAccessToken } satisfies CustomerCheckoutRecovery));
    } catch { /* Checkout still works if the browser blocks session storage. */ }
  }, [eventSlug, quote, orderIdempotencyKey, order, orderAccessToken]);

  useEffect(() => {
    setLoading(true); setError('');
    const load = eventSlug
      ? request<StoreEvent>(`/api/events/${encodeURIComponent(eventSlug)}`).then(setSelectedEvent)
      : request<{ items: StoreEvent[] }>('/api/events').then(result => setEvents(result.items.filter(event => event.performances.some(performance => performance.ticketTypes.some(ticket => ticket.available > 0)) || event.bundles.some(bundle => bundle.available > 0))));
    void load.catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load events.')).finally(() => setLoading(false));
  }, [eventSlug, catalogueRetry]);

  useEffect(() => {
    document.title = selectedEvent ? `${selectedEvent.title} tickets | Fluxora Tickets` : 'Concert tickets | Fluxora Tickets';
    return () => { document.title = 'Fluxora Studio'; };
  }, [selectedEvent]);

  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.append(meta); }
    meta.content = selectedEvent
      ? selectedEvent.summary || `${selectedEvent.title} tickets at ${selectedEvent.venueName}, ${selectedEvent.city}.`
      : 'Browse upcoming concerts, compare tickets and bundles, and book with Fluxora Tickets.';
  }, [selectedEvent]);

  useEffect(() => {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }));
    canonical.href = new URL(eventSlug ? `/event/${encodeURIComponent(eventSlug)}` : window.location.pathname, 'https://e-ticket.fluxorastudio.id').toString();
  }, [eventSlug]);

  useEffect(() => {
    if (!order || !orderAccessToken || order.paymentStatus !== 'PENDING') return;
    const interval = window.setInterval(() => {
      void request<CustomerOrder>(`/api/checkout/orders/${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${orderAccessToken}` } })
        .then(setOrder)
        .catch(() => setNotice('Payment status refresh is temporarily unavailable.'));
    }, 15000);
    return () => window.clearInterval(interval);
  }, [api, order?.id, order?.paymentStatus, orderAccessToken]);

  useEffect(() => {
    if (!order || !orderAccessToken || order.paymentStatus !== 'PAID' || order.tickets?.every(ticket => ticket.qrToken)) return;
    void request<CustomerOrder>(`/api/checkout/orders/${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${orderAccessToken}` } })
      .then(setOrder)
      .catch(() => setNotice('Ticket details are temporarily unavailable. Refresh the order to try again.'));
  }, [api, order?.id, order?.paymentStatus, order?.tickets, orderAccessToken]);

  useEffect(() => {
    if (!order?.payment?.expiresAt || order.paymentStatus !== 'PENDING') return;
    const interval = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [order?.payment?.expiresAt, order?.paymentStatus]);

  const selections = selectedEvent ? [
    ...selectedEvent.performances.flatMap(performance => performance.ticketTypes.map(ticket => ({ key: `ticket:${ticket.id}`, type: 'ticket' as const, id: ticket.id, name: `${performance.name} · ${ticket.name}` }))),
    ...selectedEvent.bundles.map(bundle => ({ key: `bundle:${bundle.id}`, type: 'bundle' as const, id: bundle.id, name: bundle.name })),
  ] : [];
  const lowestPrice = (event: StoreEvent) => {
    const prices = [...event.performances.flatMap(performance => performance.ticketTypes.filter(ticket => ticket.available > 0).map(ticket => ticket.price)), ...event.bundles.filter(bundle => bundle.available > 0).map(bundle => bundle.price)];
    return prices.length ? Math.min(...prices) : null;
  };

  async function makeQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedEvent) return;
    setSaving(true); setError(''); setNotice(''); setQuote(null); setOrder(null);
    const tickets = selections.filter(item => item.type === 'ticket' && (quantities[item.key] ?? 0) > 0).map(item => ({ id: item.id, quantity: quantities[item.key] }));
    const bundles = selections.filter(item => item.type === 'bundle' && (quantities[item.key] ?? 0) > 0).map(item => ({ id: item.id, quantity: quantities[item.key] }));
    if (!tickets.length && !bundles.length) { setError('Choose at least one ticket or bundle.'); setSaving(false); return; }
    try {
      const result = await request<CustomerQuote>('/api/checkout/quotes', { method: 'POST', body: JSON.stringify({ ...form, tickets, bundles }) });
      setQuote(result); setOrderIdempotencyKey(crypto.randomUUID()); setNotice('Availability reserved for 15 minutes. Review the total and continue to create your order.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reserve the selected tickets.'); }
    finally { setSaving(false); }
  }

  async function createOrder() {
    if (!quote) return; setSaving(true); setError(''); setNotice('');
    try {
      const created = await request<{ id: string; orderNumber: string }>('/api/checkout/orders', { method: 'POST', headers: { 'Idempotency-Key': orderIdempotencyKey }, body: JSON.stringify({ quoteId: quote.id, accessToken: quote.accessToken }) });
      setOrderAccessToken(quote.accessToken);
      const saved = await request<CustomerOrder>(`/api/checkout/orders/${encodeURIComponent(created.id)}`, { headers: { Authorization: `Bearer ${quote.accessToken}` } });
      setOrder(saved);
      try {
        await request(`/api/checkout/orders/${encodeURIComponent(created.id)}/payment`, { method: 'POST', headers: { Authorization: `Bearer ${quote.accessToken}` } });
        const refreshed = await request<CustomerOrder>(`/api/checkout/orders/${encodeURIComponent(created.id)}`, { headers: { Authorization: `Bearer ${quote.accessToken}` } });
        setOrder(refreshed);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'QRIS payment is unavailable.'); }
      setQuote(null);
      setNotice(`Order ${created.orderNumber} created. Payment status: ${saved.paymentStatus}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the order.'); }
    finally { setSaving(false); }
  }

  async function refreshOrderStatus() {
    if (!order || !orderAccessToken) return;
    setSaving(true); setError('');
    try {
      const refreshed = await request<CustomerOrder>(`/api/checkout/orders/${encodeURIComponent(order.id)}`, { headers: { Authorization: `Bearer ${orderAccessToken}` } });
      setOrder(refreshed); setNotice(`Order status: ${refreshed.paymentStatus}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh order status.'); }
    finally { setSaving(false); }
  }

  function startNewCustomerOrder() {
    setOrder(null); setQuote(null); setOrderAccessToken(''); setOrderIdempotencyKey(''); setQuantities({}); setNotice(''); setError('');
    try { sessionStorage.removeItem(CUSTOMER_CHECKOUT_RECOVERY_KEY); } catch { /* Ignore blocked browser storage. */ }
  }

  const secondsRemaining = order?.payment?.expiresAt ? Math.max(0, Math.ceil((new Date(order.payment.expiresAt).getTime() - countdownNow) / 1000)) : null;
  return <main className="ticket-storefront">
    <header className="ticket-store-header"><a className="staff-login-brand" href="/" aria-label="Fluxora tickets home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">fluxora<span>tickets</span></span></a><span>Concert tickets</span></header>
    <div className="ticket-store-content"><p className="eyebrow"><span /> FLUXORA TICKETING</p><h1>{selectedEvent?.title ?? 'Find your next concert'}</h1>
      {error && <p className="portal-alert" role="alert">{error} <button type="button" onClick={() => { setError(''); setCatalogueRetry(value => value + 1); }}>Try again</button></p>}
      {notice && <p className="portal-notice" role="status">{notice}</p>}
      {loading && <section className="ticket-event-grid ticket-event-grid-loading" aria-label="Loading events" aria-live="polite">{Array.from({ length: 4 }, (_, index) => <div className="ticket-event-skeleton" key={index}><span /><div><span /><span /><span /></div></div>)}</section>}
      {!loading && selectedEvent && <section className="ticket-event-detail">
        <p className="ticket-event-meta">{selectedEvent.venueName}{selectedEvent.venueAddress ? ` · ${selectedEvent.venueAddress}` : ''} · {selectedEvent.city} · {new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: selectedEvent.timezone }).format(new Date(selectedEvent.startsAt))}{selectedEvent.endsAt !== selectedEvent.startsAt ? ` – ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: selectedEvent.timezone }).format(new Date(selectedEvent.endsAt))}` : ''}</p>
        {selectedEvent.coverImageUrl && <img className="ticket-event-cover" src={selectedEvent.coverImageUrl} alt={`${selectedEvent.title} event artwork`} />}{selectedEvent.description && <p>{selectedEvent.description}</p>}
        {order && <section className="ticket-checkout-card"><h2>Order {order.orderNumber}</h2><p role="status">{customerPaymentStatusMessage(order.paymentStatus)}</p><p>Order status: {order.status} · Payment: {order.paymentStatus}</p><p>Total: <strong>{money(order.total)}</strong></p>
          {order.paymentStatus === 'PAID' && <section aria-label="Issued tickets"><h3>Your tickets</h3>{order.tickets?.length ? <ul className="customer-ticket-list">{order.tickets.map(ticket => <li key={ticket.publicId}><strong>Ticket {ticket.publicId} · {ticket.status}</strong>{ticket.qrToken ? <QRCodeSVG value={ticket.qrToken} size={180} level="M" includeMargin title={`Entry QR code for ticket ${ticket.publicId}`} /> : <span>Loading secure ticket code…</span>}</li>)}</ul> : <p>Payment is confirmed. Ticket issuance is being finalized.</p>}<p>Ticket email: {order.ticketDelivery?.status ?? 'not available'}{order.ticketDelivery?.sentAt ? ` · sent ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.ticketDelivery.sentAt))}` : ''}</p></section>}
          {order.payment?.qrCodeUrl && <img src={order.payment.qrCodeUrl} alt="QRIS payment code" />}{order.payment?.qrCodeContent && <textarea readOnly aria-label="QRIS payment code content" value={order.payment.qrCodeContent} />}{order.payment?.expiresAt && <p>Payment expires {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.payment.expiresAt))}.</p>}
          {order.paymentStatus === 'PENDING' && <><p>Payment status refreshes automatically while this page is open. {secondsRemaining !== null ? `Time remaining: ${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}.` : ''}</p><button className="button button-primary" type="button" disabled={saving} onClick={() => void refreshOrderStatus()}>{saving ? 'Refreshing…' : 'Refresh order status'}</button></>}
          {order.paymentStatus !== 'PENDING' && <button type="button" className="button" onClick={startNewCustomerOrder}>Start a new order</button>}
        </section>}
        {!order && quote && <section className="ticket-checkout-card"><h2>Review your order</h2><ul>{quote.items.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name} · {money(item.unitPrice * item.quantity)} ({item.admissionsPerUnit * item.quantity} admissions)</li>)}</ul><p>Order total: <strong>{money(quote.total)}</strong></p><p>Quote expires {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(quote.expiresAt))}.</p><button className="button button-primary" type="button" disabled={saving} onClick={() => void createOrder()}>{saving ? 'Creating order…' : 'Create order and continue to payment'}</button><button type="button" className="button" onClick={() => { setQuote(null); setOrderIdempotencyKey(''); setError(''); setNotice('Select your tickets again to refresh availability.'); }}>Refresh ticket selection</button></section>}
        {!order && !quote && <>
          <section className="ticket-inventory-list"><h2>Available tickets and bundles</h2>{selectedEvent.performances.map(performance => <div key={performance.id}><h3>{performance.name} · {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: selectedEvent.timezone }).format(new Date(performance.startsAt))}</h3>{performance.ticketTypes.map(ticket => <label className="ticket-inventory-row" key={ticket.id}><span><strong>{ticket.name}</strong><small>{ticket.description || `${ticket.available} available · max ${ticket.perOrderLimit} per order`}</small></span><span>{money(ticket.price)}<input aria-label={`Quantity for ${ticket.name}`} type="number" min="0" max={Math.min(ticket.available, ticket.perOrderLimit)} value={quantities[`ticket:${ticket.id}`] ?? 0} onChange={event => setQuantities(current => ({ ...current, [`ticket:${ticket.id}`]: Number(event.target.value) }))} /></span></label>)}</div>)}
            {selectedEvent.bundles.map(bundle => <label className="ticket-inventory-row" key={bundle.id}><span><strong>{bundle.name} bundle</strong><small>{bundle.items.map(item => `${item.quantity} × ${item.ticketType.name}`).join(', ')} · {bundle.available} available</small></span><span>{money(bundle.price)}<input aria-label={`Quantity for ${bundle.name}`} type="number" min="0" max={Math.min(bundle.available, bundle.perOrderLimit)} value={quantities[`bundle:${bundle.id}`] ?? 0} onChange={event => setQuantities(current => ({ ...current, [`bundle:${bundle.id}`]: Number(event.target.value) }))} /></span></label>)}
          </section>
          <form className="ticket-checkout-card" onSubmit={makeQuote}><h2>Contact details</h2><p>After confirmed payment, ticket details appear here. Email delivery status is shown on the order and may be pending.</p><label>Email<input required type="email" value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label><label>First name<input value={form.firstName} onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))} /></label><label>Last name<input value={form.lastName} onChange={event => setForm(current => ({ ...current, lastName: event.target.value }))} /></label><label>Phone<input type="tel" value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Checking availability…' : 'Reserve tickets and get total'}</button></form>
        </>}
      </section>}
      {!loading && !selectedEvent && <CustomerEventCatalogue events={events} money={money} lowestPrice={lowestPrice} />}
    </div>
  </main>;
}

function StaffInvitationAcceptance() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || window.location.hash.slice(1);
  const [invitation, setInvitation] = useState<{ email: string; role: string; partnerName: string; partnerStatus: string; expiresAt: string; requiresPassword: boolean } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setError('Invitation is invalid or expired.'); setLoading(false); return; }
    fetch(`${backendUrl}/api/staff/auth/invitations/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async response => { const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.message || 'Invitation is invalid or expired.'); return data; })
      .then(data => setInvitation(data))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Invitation is invalid or expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    if (invitation?.requiresPassword && password !== confirmPassword) { setError('Passwords do not match.'); setSaving(false); return; }
    try {
      const response = await fetch(`${backendUrl}/api/staff/auth/invitations/accept`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...(invitation?.requiresPassword ? { password } : {}) }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || 'Could not accept invitation.');
      window.history.replaceState(null, '', window.location.pathname);
      setAccepted(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not accept invitation.'); }
    finally { setSaving(false); }
  }

  return <main className="staff-login-page"><a className="staff-login-brand" href="/" aria-label="Fluxora Studio home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">fluxora<span>studio</span></span></a><section className="staff-login-card"><p className="eyebrow"><span /> FLUXORA TICKETING</p><h1>{accepted ? 'Invitation accepted' : 'Join your event team'}</h1>{loading ? <p>Checking invitation…</p> : accepted ? <><p>Your account is ready for {invitation?.partnerName}. Sign in to open your workspace.</p>{invitation?.partnerStatus === 'PENDING' && <p className="staff-login-intro">This partner is awaiting platform approval. Your access will be available after activation.</p>}<a className="button button-primary staff-submit" href="/partner">Continue to partner sign in</a></> : invitation ? <><p className="staff-login-intro">You were invited to {invitation.partnerName} as {invitation.role.toLowerCase().replace('_', ' ')}.</p>{invitation.partnerStatus === 'PENDING' && <p className="staff-login-intro">This partner is awaiting platform approval. You can accept the invitation now; workspace access starts after activation.</p>}<p>{invitation.email}</p><form className="staff-login-form" onSubmit={accept}>{invitation.requiresPassword && <><label htmlFor="invite-password">Create password (12–128 characters)</label><input id="invite-password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /><label htmlFor="invite-confirm">Confirm password</label><input id="invite-confirm" type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></>}{error && <p className="staff-login-error" role="alert">{error}</p>}<button className="button button-primary staff-submit" type="submit" disabled={saving}>{saving ? 'Accepting…' : 'Accept invitation'}</button></form></> : <p className="staff-login-error" role="alert">{error || 'Invitation is invalid or expired.'}</p>}</section></main>;
}

type Locale = 'id' | 'en';

const locale = (): Locale => (window.location.pathname === '/en' || window.location.pathname.startsWith('/en/') ? 'en' : 'id');

const translations = {
  id: {
    title: 'Pengembangan Software Bisnis | Fluxora Studio',
    description: 'Fluxora Studio merancang dan membangun software bisnis: e-commerce, asisten AI, ERP & logistik, serta e-ticketing. Diskusikan kebutuhan sistem bisnis Anda.',
    switchLabel: 'Switch to English',
    navLabel: 'Navigasi utama',
    menuOpen: 'Buka navigasi',
    menuClose: 'Tutup navigasi',
    nav: ['Layanan', 'Pendekatan', 'Studio', 'FAQ', 'Diskusikan proyek'],
    heroEyebrow: 'PENGEMBANGAN SOFTWARE BISNIS',
    heroTitle: <>Sistem digital yang bergerak <em>seirama</em> dengan bisnis Anda.</>,
    heroDescription: 'Kami merancang dan membangun e-commerce, asisten AI, ERP & logistik, serta e-ticketing sesuai kebutuhan nyata bisnis.',
    primaryCta: 'Diskusikan kebutuhan',
    servicesLink: 'Lihat layanan',
    heroImageAlt: 'Visual abstrak jaringan digital yang menghubungkan beberapa sistem',
    specialties: 'EMPAT AREA KEAHLIAN',
    introLabel: 'TENTANG FLUXORA',
    intro: <>Teknologi seharusnya membantu pekerjaan terasa lebih <em>jelas</em>—mulai dari pengalaman pelanggan hingga proses operasional sehari-hari.</>,
    servicesLabel: 'LAYANAN',
    servicesTitle: <>Empat fokus.<br /><em>Satu arah yang jelas.</em></>,
    servicesIntro: 'Pilih kebutuhan yang paling dekat dengan tantangan bisnis Anda. Ruang lingkup dan fitur disusun sesuai konteks proyek.',
    services: [
      { title: 'E-commerce', description: 'Pengalaman belanja yang rapi bagi pelanggan, dengan alur pesanan yang jelas bagi tim di belakangnya.', capabilities: ['Toko online', 'Katalog & pesanan', 'Integrasi pembayaran'] },
      { title: 'Asisten AI', description: 'Bantuan yang memahami konteks bisnis dan membantu pelanggan atau tim menyelesaikan pekerjaan lebih cepat.', capabilities: ['Asisten pelanggan', 'Basis pengetahuan', 'Otomasi alur kerja'] },
      { title: 'ERP & logistik', description: 'Alur operasional yang menghubungkan stok, pesanan, dan proses pemenuhan sesuai cara tim Anda bekerja.', capabilities: ['Inventaris', 'Operasional pesanan', 'Alur fulfilment'] },
      { title: 'E-ticketing', description: 'Satu alur yang jelas dari pembelian tiket sampai validasi kehadiran di hari acara.', capabilities: ['Penjualan tiket', 'Data peserta', 'Check-in acara'] },
    ],
    discussService: (name: string) => `Diskusikan kebutuhan ${name}`,
    discuss: 'Diskusikan kebutuhan',
    fitEyebrow: 'MEMILIH PENDEKATAN',
    fitTitle: 'Tidak semua masalah perlu dibuatkan sistem baru.',
    fitIntro: 'Solusi terbaik dimulai dari kebutuhan—bukan dari teknologi yang sedang populer.',
    fitOptions: [
      { label: '01 — MULAI SEDERHANA', title: 'Platform siap pakai bisa cukup', body: 'Jika kebutuhan masih umum, alur kerja sederhana, dan produk standar dapat membantu tim mulai lebih cepat.' },
      { label: '02 — PERTIMBANGKAN SISTEM KHUSUS', title: 'Bangun sesuai alur bisnis', body: 'Jika proses penting masih manual, alat yang ada tidak saling terhubung, atau kebutuhan tumbuh di luar batas platform standar.' },
    ],
    approachEyebrow: 'PENDEKATAN',
    approachTitle: <>Pekerjaan yang baik dimulai dengan <em>memahami.</em></>,
    approachIntro: 'Setiap proyek bergerak dari konteks bisnis menuju solusi yang dapat digunakan dan dikembangkan.',
    approachLink: 'Mulai percakapan',
    steps: [
      { title: 'Pahami kebutuhan', description: 'Mulai dari tujuan bisnis, pengguna, alur kerja, dan sistem yang sudah digunakan.' },
      { title: 'Susun arah', description: 'Rangkum ruang lingkup, prioritas, dan pendekatan yang sesuai dengan kebutuhan.' },
      { title: 'Rancang & bangun', description: 'Kembangkan pengalaman dan sistem secara bertahap agar keputusan tetap jelas.' },
      { title: 'Rilis & kembangkan', description: 'Siapkan peluncuran, serah terima, dan dukungan lanjutan sesuai kesepakatan.' },
    ],
    processLabel: 'ALUR PROYEK',
    faqEyebrow: 'PERTANYAAN UMUM',
    faqTitle: <>Sebelum kita<br /><em>mulai bicara.</em></>,
    faqIntro: 'Jawaban singkat untuk membantu Anda memahami langkah awal.',
    faqs: [
      { question: 'Apa saja yang bisa dibangun Fluxora?', answer: 'Fluxora berfokus pada platform e-commerce, asisten AI, sistem ERP dan logistik, serta e-ticketing. Ruang lingkup setiap proyek ditentukan dari kebutuhan dan proses bisnis yang ingin diperbaiki.' },
      { question: 'Bagaimana cara memulai proyek?', answer: 'Mulai dengan menceritakan tujuan dan tantangan yang sedang dihadapi. Setelah kebutuhan awal dipahami, ruang lingkup dan pendekatan proyek dapat dibahas bersama.' },
      { question: 'Apakah Fluxora dapat mengembangkan sistem yang sudah ada?', answer: 'Kemungkinan pengembangan atau integrasi bergantung pada teknologi dan kondisi sistem yang digunakan. Informasi awal tentang sistem tersebut membantu menentukan langkah yang tepat.' },
      { question: 'Bagaimana estimasi biaya dan waktu ditentukan?', answer: 'Estimasi diberikan setelah tujuan, kebutuhan, integrasi, dan prioritas proyek dibahas. Setiap ruang lingkup memiliki kebutuhan yang berbeda.' },
      { question: 'Apakah ada dukungan setelah peluncuran?', answer: 'Kebutuhan pemeliharaan atau pengembangan lanjutan dapat dibahas saat menyusun ruang lingkup dan kesepakatan proyek.' },
    ],
    contactEyebrow: 'LANGKAH BERIKUTNYA',
    contactTitle: <>Ada proses yang ingin Anda <em>perbaiki?</em></>,
    contactBody: 'Ceritakan kebutuhan dan tantangannya. Kita mulai dengan memahami masalah yang perlu diselesaikan.',
    contactButton: 'Hubungi Fluxora',
    emailSubject: 'Diskusi proyek Fluxora',
    footerTagline: 'DIGITAL SYSTEMS, BUILT AROUND YOUR WORK.',
    backToTop: 'KEMBALI KE ATAS',
    backToTopLabel: 'Kembali ke atas',
  },
  en: {
    title: 'Business Software Development | Fluxora Studio',
    description: 'Fluxora Studio designs and builds business software: e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing. Tell us what your business needs.',
    switchLabel: 'Beralih ke Bahasa Indonesia',
    navLabel: 'Main navigation',
    menuOpen: 'Open navigation',
    menuClose: 'Close navigation',
    nav: ['Services', 'Approach', 'Studio', 'FAQ', 'Discuss a project'],
    heroEyebrow: 'BUSINESS SOFTWARE DEVELOPMENT',
    heroTitle: <>Digital systems that move <em>in step</em> with your business.</>,
    heroDescription: 'We design and build e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing around real business needs.',
    primaryCta: 'Discuss your needs',
    servicesLink: 'Explore services',
    heroImageAlt: 'Abstract digital network connecting several business systems',
    specialties: 'FOUR AREAS OF FOCUS',
    introLabel: 'ABOUT FLUXORA',
    intro: <>Technology should make work feel more <em>clear</em>—from customer experiences to everyday operations.</>,
    servicesLabel: 'SERVICES',
    servicesTitle: <>Four areas.<br /><em>One clear direction.</em></>,
    servicesIntro: 'Choose the area closest to your business challenge. Scope and capabilities are shaped around each project.',
    services: [
      { title: 'E-commerce', description: 'A considered shopping experience for customers, with a clear order flow for the team behind it.', capabilities: ['Online storefronts', 'Catalogues & orders', 'Payment integrations'] },
      { title: 'AI assistants', description: 'Context-aware assistance that helps customers or teams find answers and move work forward.', capabilities: ['Customer support', 'Knowledge bases', 'Workflow automation'] },
      { title: 'ERP & logistics', description: 'Operational workflows connecting inventory, orders, and fulfilment to the way your team works.', capabilities: ['Inventory', 'Order operations', 'Fulfilment workflows'] },
      { title: 'E-ticketing', description: 'A clear journey from ticket purchase through attendee check-in on event day.', capabilities: ['Ticket sales', 'Attendee records', 'Event check-in'] },
    ],
    discussService: (name: string) => `Discuss ${name} needs`,
    discuss: 'Discuss your needs',
    fitEyebrow: 'CHOOSING AN APPROACH',
    fitTitle: 'Not every problem needs a custom system.',
    fitIntro: 'The right solution starts with the need—not with whatever technology is trending.',
    fitOptions: [
      { label: '01 — START SIMPLE', title: 'An existing platform may be enough', body: 'When needs are common and workflows are simple, a standard product can help a team get started.' },
      { label: '02 — CONSIDER CUSTOM SOFTWARE', title: 'Build around your workflow', body: 'When important processes remain manual, tools do not connect, or needs have outgrown standard platforms.' },
    ],
    approachEyebrow: 'OUR APPROACH',
    approachTitle: <>Good work begins with <em>understanding.</em></>,
    approachIntro: 'Each project moves from business context toward a solution people can use and continue to develop.',
    approachLink: 'Start a conversation',
    steps: [
      { title: 'Understand the need', description: 'Start with business goals, users, workflows, and the systems already in place.' },
      { title: 'Set a direction', description: 'Bring together scope, priorities, and an approach shaped around the need.' },
      { title: 'Design & build', description: 'Develop the experience and system in stages, keeping decisions clear.' },
      { title: 'Launch & evolve', description: 'Plan release, handover, and any follow-on support by agreement.' },
    ],
    processLabel: 'PROJECT FLOW',
    faqEyebrow: 'FREQUENTLY ASKED QUESTIONS',
    faqTitle: <>Before we<br /><em>get started.</em></>,
    faqIntro: 'A few answers to help you understand the first step.',
    faqs: [
      { question: 'What can Fluxora build?', answer: 'Fluxora focuses on e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing. Project scope is shaped around the business need and workflow to improve.' },
      { question: 'How do we get a project started?', answer: 'Start by sharing your goals and the challenge you are facing. Once we understand the initial need, we can discuss project scope and an appropriate approach.' },
      { question: 'Can Fluxora extend an existing system?', answer: 'The options for development or integration depend on the technology and condition of the system. Some initial context helps determine a sensible next step.' },
      { question: 'How are timeline and cost estimated?', answer: 'We can estimate after discussing goals, requirements, integrations, and priorities. Each project scope has different needs.' },
      { question: 'Is support available after launch?', answer: 'Maintenance or further development can be discussed while defining project scope and terms.' },
    ],
    contactEyebrow: 'THE NEXT STEP',
    contactTitle: <>A process you would like to <em>improve?</em></>,
    contactBody: 'Tell us what you need and what is getting in the way. We can begin by understanding the problem to solve.',
    contactButton: 'Contact Fluxora',
    emailSubject: 'Fluxora project discussion',
    footerTagline: 'DIGITAL SYSTEMS, BUILT AROUND YOUR WORK.',
    backToTop: 'BACK TO TOP',
    backToTopLabel: 'Back to top',
  },
} as const;

const projectStepNumbers = ['01', '02', '03', '04'];

function App() {
  const hostname = window.location.hostname;
  const isStaffHost = hostname.includes('admin-eticket') || hostname.includes('partner-eticket') || hostname.startsWith('admin.') || hostname.startsWith('partner.');
  if (window.location.pathname === '/staff/invite') return <StaffInvitationAcceptance />;
  if (isStaffHost || window.location.pathname === '/staff/login' || window.location.pathname === '/admin' || window.location.pathname === '/partner') return <StaffLogin />;
  if (isCustomerStorefrontRoute(hostname, window.location.pathname)) return <TicketStorefront />;
  const currentLocale = locale();
  const t = translations[currentLocale];
  const isEnglish = currentLocale === 'en';
  const languageHref = isEnglish ? '/' : '/en/';
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.documentElement.lang = isEnglish ? 'en' : 'id';
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
  }, [isEnglish, t.description, t.title]);

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top" aria-label={isEnglish ? 'Fluxora Studio, home' : 'Fluxora Studio, halaman utama'} onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>

        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? t.menuClose : t.menuOpen}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav id="primary-navigation" className={menuOpen ? 'primary-nav is-open' : 'primary-nav'} aria-label={t.navLabel}>
          <a href="#layanan" onClick={closeMenu}>{t.nav[0]}</a>
          <a href="#pendekatan" onClick={closeMenu}>{t.nav[1]}</a>
          <a href="#studio" onClick={closeMenu}>{t.nav[2]}</a>
          <a href="#faq" onClick={closeMenu}>{t.nav[3]}</a>
          <a className="language-toggle" href={languageHref} lang={isEnglish ? 'id' : 'en'} aria-label={t.switchLabel} onClick={closeMenu}>{isEnglish ? 'ID' : 'EN'}</a>
          <a className="nav-contact" href="#kontak" onClick={closeMenu}>{t.nav[4]}</a>
        </nav>
      </header>

      <section className="hero page-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> {t.heroEyebrow} <b>·</b> FLUXORA</p>
          <h1 id="hero-title">{t.heroTitle}</h1>
          <p className="hero-description">{t.heroDescription}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#kontak">{t.primaryCta}</a>
            <a className="text-link" href="#layanan">{t.servicesLink}</a>
          </div>
          <div className="hero-note"><span>{isEnglish ? 'STRATEGY' : 'STRATEGI'}</span><i /><span>{isEnglish ? 'DESIGN' : 'DESAIN'}</span><i /><span>ENGINEERING</span></div>
        </div>

        <figure className="hero-visual">
          <div className="hero-visual-backdrop" />
          <img src="/fluxora-network.png" alt={t.heroImageAlt} />
          <figcaption><span>FLUXORA STUDIO</span><span>{t.specialties}</span></figcaption>
          <span className="visual-index" aria-hidden="true">F—01</span>
        </figure>
        <div className="hero-bottomline" aria-hidden="true"><span>SOFTWARE BUILT AROUND THE WORK</span><span>01 — 04</span></div>
      </section>

      <section className="studio-intro" id="studio">
        <div className="section-label"><span>01</span><span>{t.introLabel}</span></div>
        <p>{t.intro}</p>
        <span className="intro-seal" aria-hidden="true">F<span>.</span></span>
      </section>

      <section className="services page-shell" id="layanan" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> {t.servicesLabel}</p>
            <h2 id="services-title">{t.servicesTitle}</h2>
          </div>
          <p className="section-intro">{t.servicesIntro}</p>
        </div>
        <div className="service-grid">
          {t.services.map(({ title, description, capabilities }, index) => {
            const Icon = [ShoppingBag, BrainCircuit, Boxes, Ticket][index];
            const number = projectStepNumbers[index];
            return (
              <article className="service-card" key={number}>
                <div className="service-card-top"><span>{number} / 04</span><Icon size={22} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>{capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
                <a href="#kontak" aria-label={t.discussService(title)}>{t.discuss} <span aria-hidden="true">+</span></a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fit-check" aria-labelledby="fit-title">
        <div className="fit-inner page-shell">
          <div className="fit-heading">
            <p className="eyebrow"><span /> {t.fitEyebrow}</p>
            <h2 id="fit-title">{t.fitTitle}</h2>
            <p>{t.fitIntro}</p>
          </div>
          <div className="fit-columns">
            {t.fitOptions.map(({ label, title, body }, index) => (
              <article className={index === 1 ? 'fit-custom' : undefined} key={label}>
                <span className="fit-index">{label}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="approach" id="pendekatan" aria-labelledby="approach-title">
        <div className="approach-inner page-shell">
          <div className="approach-heading">
            <p className="eyebrow"><span /> {t.approachEyebrow}</p>
            <h2 id="approach-title">{t.approachTitle}</h2>
            <p>{t.approachIntro}</p>
            <a className="approach-link" href="#kontak">{t.approachLink} <span aria-hidden="true">+</span></a>
          </div>
          <div className="steps-list">
            {t.steps.map(({ title, description }, index) => (
              <article className="step" key={projectStepNumbers[index]}>
                <span className="step-number">{projectStepNumbers[index]}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
                <Check size={16} aria-hidden="true" />
              </article>
            ))}
          </div>
          <div className="approach-footer"><span>{t.processLabel}</span><span className="approach-rule" /><span>01 — 04</span></div>
        </div>
      </section>

      <section className="faq page-shell" id="faq" aria-labelledby="faq-title">
        <div className="faq-heading">
          <p className="eyebrow"><span /> {t.faqEyebrow}</p>
          <h2 id="faq-title">{t.faqTitle}</h2>
          <p>{t.faqIntro}</p>
        </div>
        <div className="faq-list">
          {t.faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}<span aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="contact" id="kontak" aria-labelledby="contact-title">
        <div className="contact-inner page-shell">
          <div className="contact-copy">
            <p className="eyebrow"><span /> {t.contactEyebrow}</p>
            <h2 id="contact-title">{t.contactTitle}</h2>
            <p>{t.contactBody}</p>
            <a className="button button-light" href={`mailto:hello@fluxorastudio.id?subject=${encodeURIComponent(t.emailSubject)}`}>{t.contactButton}</a>
          </div>
          <div className="contact-aside" aria-hidden="true"><span>F</span><i /><i /><i /></div>
        </div>
      </section>

      <footer className="site-footer page-shell">
        <a className="brand" href="#top" aria-label={t.backToTopLabel}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>
        <span className="footer-caption">{t.footerTagline}</span>
        <a className="back-to-top" href="#top">{t.backToTop}</a>
        <span className="copyright">© {new Date().getFullYear()} FLUXORA STUDIO</span>
      </footer>
    </main>
  );
}

export default App;
