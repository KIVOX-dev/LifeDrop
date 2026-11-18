/**
 * OpenAPI 3 description of the LifeDrop API, generated from a compact endpoint table so that every
 * route stays documented in one place. Served at /api/docs (UI) and /api/docs.json.
 */
type Access = 'public' | 'user' | 'donor' | 'admin' | 'super';
type Row = [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, tag: string, summary: string, access: Access, body?: string];

const E: Row[] = [
  // Authentication
  ['post', '/auth/register', 'Auth', 'Register a donor account (sets refresh cookie, returns access token)', 'public', 'RegisterBody'],
  ['post', '/auth/login', 'Auth', 'Log in (donor, admin, super admin)', 'public', 'LoginBody'],
  ['post', '/auth/logout', 'Auth', 'Revoke the current refresh-token family and clear the cookie', 'public'],
  ['post', '/auth/refresh', 'Auth', 'Rotate the refresh token (cookie) and obtain a new access token', 'public'],
  ['post', '/auth/verify-email', 'Auth', 'Verify email with the emailed token', 'public', 'TokenBody'],
  ['post', '/auth/resend-verification', 'Auth', 'Re-send the verification email', 'user'],
  ['post', '/auth/forgot-password', 'Auth', 'Request a password reset email', 'public', 'EmailBody'],
  ['post', '/auth/reset-password', 'Auth', 'Set a new password using the emailed token', 'public', 'ResetBody'],
  ['post', '/auth/change-password', 'Auth', 'Change password (revokes other sessions)', 'user', 'ChangePasswordBody'],
  ['get', '/auth/me', 'Auth', 'Current user and donor profile', 'user'],
  // Donors
  ['get', '/donors/profile', 'Donors', 'Own profile, privacy and rank', 'donor'],
  ['patch', '/donors/profile', 'Donors', 'Update own profile, privacy and email preferences', 'donor'],
  ['post', '/donors/profile/picture', 'Donors', 'Upload profile picture (multipart, JPG/PNG)', 'donor'],
  ['get', '/donors/profile/picture', 'Donors', 'Signed URL of own profile picture', 'donor'],
  ['patch', '/donors/availability', 'Donors', 'Toggle donor availability', 'donor', 'AvailabilityBody'],
  ['get', '/donors/donations', 'Donors', 'Own donation history and next reminder', 'donor'],
  ['get', '/donors/leaderboard', 'Donors', 'Top donors plus own rank', 'donor'],
  ['get', '/donors/my-data', 'Donors', 'Download all personal data (privacy export)', 'donor'],
  ['post', '/donors/deletion-request', 'Donors', 'Request account deletion', 'donor'],
  ['delete', '/donors/deletion-request', 'Donors', 'Cancel deletion request', 'donor'],
  ['get', '/donors', 'Donors', 'List/search donors (blood group, city, state, status)', 'admin'],
  ['get', '/donors/{id}', 'Donors', 'Donor details with history', 'admin'],
  ['patch', '/donors/{id}/status', 'Donors', 'Activate / deactivate a donor', 'admin'],
  ['delete', '/donors/{id}', 'Donors', 'Fulfil deletion: erase personal data and files', 'admin'],
  // Donations
  ['get', '/donations', 'Donations', 'List donation records', 'admin'],
  ['get', '/donations/{id}', 'Donations', 'Donation details (owner or admin)', 'user'],
  ['patch', '/donations/{id}', 'Donations', 'Correct donation date/location/blood group', 'admin'],
  ['patch', '/donations/{id}/status', 'Donations', 'Verify / reject / invalidate a donation', 'admin', 'DonationStatusBody'],
  // Certificates
  ['post', '/certificates/upload', 'Certificates', 'Upload certificate (multipart: certificate, donationDate, location, bloodGroup?)', 'donor'],
  ['get', '/certificates/my-certificates', 'Certificates', 'Own certificates', 'donor'],
  ['get', '/certificates', 'Certificates', 'Review queue / all certificates', 'admin'],
  ['get', '/certificates/{id}', 'Certificates', 'Certificate details (owner or admin)', 'user'],
  ['post', '/certificates/{id}/approve', 'Certificates', 'Approve (credits exactly 100 points, schedules reminder, emails donor)', 'admin'],
  ['post', '/certificates/{id}/reject', 'Certificates', 'Reject with a reason (emails donor)', 'admin', 'ReasonBody'],
  ['get', '/certificates/{id}/download', 'Certificates', 'Short-lived signed URL (?inline=1 for preview)', 'user'],
  ['delete', '/certificates/{id}', 'Certificates', 'Delete / withdraw a certificate and its stored file', 'user'],
  // Requirements
  ['get', '/requirements', 'Requirements', 'List requirements (public: published & open only)', 'public'],
  ['post', '/requirements/create', 'Requirements', 'Create a draft requirement', 'admin', 'RequirementBody'],
  ['get', '/requirements/{id}', 'Requirements', 'Requirement details', 'public'],
  ['patch', '/requirements/{id}', 'Requirements', 'Edit a requirement', 'admin', 'RequirementBody'],
  ['delete', '/requirements/{id}', 'Requirements', 'Soft-delete a requirement', 'admin'],
  ['post', '/requirements/{id}/publish', 'Requirements', 'Publish and queue emails to opted-in matching donors', 'admin'],
  ['post', '/requirements/{id}/close', 'Requirements', 'Close a requirement', 'admin'],
  ['get', '/requirements/{id}/notifications', 'Requirements', 'Delivery statistics and per-donor status', 'admin'],
  ['post', '/requirements/{id}/notifications', 'Requirements', 'Dispatch to newly eligible donors (never duplicates)', 'admin'],
  // Points
  ['get', '/points/my-points', 'Points', 'Own total points and rank', 'user'],
  ['get', '/points/transactions', 'Points', 'Points ledger', 'user'],
  ['get', '/leaderboard', 'Leaderboard', 'Overall leaderboard (filters: bloodGroup, city)', 'public'],
  ['get', '/leaderboard/monthly', 'Leaderboard', 'Monthly leaderboard (year, month)', 'public'],
  ['get', '/leaderboard/yearly', 'Leaderboard', 'Yearly leaderboard (year)', 'public'],
  // Notifications
  ['get', '/notifications', 'Notifications', 'In-app notifications with unread count', 'user'],
  ['patch', '/notifications/read-all', 'Notifications', 'Mark all as read', 'user'],
  ['patch', '/notifications/{id}/read', 'Notifications', 'Mark one as read', 'user'],
  ['get', '/notifications/unsubscribe', 'Notifications', 'One-click unsubscribe from non-essential email (signed token)', 'public'],
  // Admin
  ['get', '/admin/dashboard', 'Admin', 'Dashboard statistics', 'admin'],
  ['get', '/admin/analytics', 'Admin', 'Analytics (from, to)', 'admin'],
  ['get', '/admin/reports', 'Admin', 'CSV/JSON export (type: donors|donations|certificates|points|requirements|emails)', 'admin'],
  ['get', '/admin/users', 'Admin', 'List users (administrators: super admin only)', 'admin'],
  ['post', '/admin/users', 'Admin', 'Create an administrator', 'super', 'AdminBody'],
  ['patch', '/admin/users/{id}', 'Admin', 'Activate/deactivate or change administrator role', 'super'],
  ['get', '/admin/settings', 'Admin', 'Platform settings and integration status', 'admin'],
  ['put', '/admin/settings', 'Admin', 'Update platform settings', 'super'],
  ['get', '/admin/activity-logs', 'Admin', 'Audit log', 'admin'],
  ['get', '/admin/email-logs', 'Admin', 'Email delivery logs', 'admin'],
  ['post', '/admin/email-logs/{id}/retry', 'Admin', 'Retry a failed email', 'admin'],
  ['post', '/admin/email-logs/requeue-stale', 'Admin', 'Re-queue emails stuck in the queue state', 'admin'],
  ['get', '/admin/reminders', 'Admin', 'Follow-up reminders', 'admin'],
  ['patch', '/admin/reminders/{id}', 'Admin', 'Reschedule a reminder', 'admin'],
  ['post', '/admin/reminders/{id}/cancel', 'Admin', 'Cancel a reminder', 'admin'],
  // AI
  ['post', '/ai/admin-assistant', 'AI', 'Admin assistant (chat, summaries, insights, requirement description)', 'admin'],
  ['post', '/ai/donor-assistant', 'AI', 'Donor help chatbot (approved knowledge only)', 'user'],
  ['post', '/ai/report-summary', 'AI', 'Generate a monthly / period report', 'admin'],
  // Public & webhooks
  ['get', '/public/stats', 'Public', 'Platform impact statistics', 'public'],
  ['post', '/public/contact', 'Public', 'Contact form (emails administrators)', 'public'],
  ['post', '/webhooks/brevo', 'Webhooks', 'Brevo transactional event webhook (Bearer / x-webhook-secret)', 'public'],
  ['get', '/health', 'System', 'Liveness / readiness probe', 'public'],
];

const bodies: Record<string, object> = {
  RegisterBody: { type: 'object', required: ['fullName', 'email', 'phone', 'password', 'dateOfBirth', 'bloodGroup', 'city', 'state', 'country', 'address', 'acceptPrivacy', 'acceptTerms'], properties: { fullName: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string' }, password: { type: 'string', format: 'password' }, dateOfBirth: { type: 'string', format: 'date' }, gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'] }, bloodGroup: { $ref: '#/components/schemas/BloodGroup' }, city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string' }, address: { type: 'string' }, emergencyContact: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, relation: { type: 'string' } } }, acceptPrivacy: { type: 'boolean', enum: [true] }, acceptTerms: { type: 'boolean', enum: [true] } } },
  LoginBody: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } },
  TokenBody: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } },
  EmailBody: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
  ResetBody: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string' } } },
  ChangePasswordBody: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } },
  AvailabilityBody: { type: 'object', required: ['isAvailable'], properties: { isAvailable: { type: 'boolean' } } },
  DonationStatusBody: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['VERIFIED', 'REJECTED'] }, remarks: { type: 'string' } } },
  ReasonBody: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 5 } } },
  AdminBody: { type: 'object', required: ['fullName', 'email', 'password'], properties: { fullName: { type: 'string' }, email: { type: 'string' }, password: { type: 'string' }, role: { type: 'string', enum: ['ADMIN', 'SUPER_ADMIN'] } } },
  RequirementBody: { type: 'object', required: ['title', 'bloodGroup', 'hospitalName', 'address', 'city', 'state', 'country', 'unitsRequired', 'contactPerson', 'contactPhone', 'description', 'lastDateToRespond'], properties: { title: { type: 'string' }, bloodGroup: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'ALL'] }, hospitalName: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string' }, country: { type: 'string' }, unitsRequired: { type: 'integer' }, contactPerson: { type: 'string' }, contactPhone: { type: 'string' }, contactEmail: { type: 'string' }, description: { type: 'string' }, urgency: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] }, lastDateToRespond: { type: 'string', format: 'date-time' } } },
};

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [method, path, tag, summary, access, body] of E) {
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string', pattern: '^[a-f0-9]{24}$' } }));
    const multipart = path === '/certificates/upload' || path === '/donors/profile/picture';
    const op: Record<string, unknown> = {
      tags: [tag],
      summary,
      description: access === 'public' ? 'No authentication required.' : { user: 'Any authenticated user.', donor: 'Role: DONOR.', admin: 'Roles: ADMIN, SUPER_ADMIN.', super: 'Role: SUPER_ADMIN.' }[access],
      ...(access !== 'public' ? { security: [{ bearerAuth: [] }] } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(body ? { requestBody: { required: true, content: { 'application/json': { schema: bodies[body] } } } } : {}),
      ...(multipart ? { requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { certificate: { type: 'string', format: 'binary' }, picture: { type: 'string', format: 'binary' }, donationDate: { type: 'string', format: 'date' }, location: { type: 'string' }, bloodGroup: { type: 'string' } } } } } } } : {}),
      responses: {
        [method === 'post' && /upload|register|create|users$/.test(path) ? '201' : '200']: { description: 'Success', content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } } },
        '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        ...(access !== 'public' ? { '401': { description: 'Not authenticated' }, '403': { description: 'Forbidden (insufficient role)' } } : {}),
        '404': { description: 'Not found' },
        '429': { description: 'Rate limited' },
      },
    };
    (paths[path] ??= {})[method] = op;
  }
  return {
    openapi: '3.0.3',
    info: { title: 'LifeDrop API', version: '1.0.0', description: 'Blood donation management platform. Success: `{success:true,data,meta?}`. Error: `{success:false,error:{code,message,details?}}`. All routes are prefixed with /api/v1.' },
    servers: [{ url: serverUrl }],
    tags: [...new Set(E.map((e) => e[2]))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        BloodGroup: { type: 'string', enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'] },
        Envelope: { type: 'object', properties: { success: { type: 'boolean', example: true }, data: {}, meta: { type: 'object', properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } } },
        Error: { type: 'object', properties: { success: { type: 'boolean', example: false }, error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } } },
      },
    },
  };
}
