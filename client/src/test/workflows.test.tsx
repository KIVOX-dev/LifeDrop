import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiPost: vi.fn(), getPaged: vi.fn(), get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<any>()),
  api: { post: h.apiPost, get: vi.fn() },
  getPaged: h.getPaged,
  get: h.get,
  post: h.post,
}));
vi.mock('@/store/auth', () => ({ useAuth: () => ({ user: { fullName: 'Asha', role: 'DONOR', emailVerified: true }, profile: { bloodGroup: 'O+' }, isAdmin: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { Column, DataTable } from '@/components/ui/data';
import { ConfirmDialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/primitives';
import { daysLeft, fmtDate, initials, timeAgo } from '@/lib/utils';
import { AdminCertificates } from '@/pages/admin/pages1';
import { UploadCertificate } from '@/pages/donor/pages';

beforeEach(() => vi.clearAllMocks());

const file = (name: string, type: string, bytes = 100) => new File([new Uint8Array(bytes)], name, { type });

describe('certificate upload workflow (donor)', () => {
  const view = () => render(<MemoryRouter><UploadCertificate /></MemoryRouter>);
  const fillForm = async () => {
    await userEvent.type(screen.getByLabelText('Donation date'), '2025-01-10');
    await userEvent.type(screen.getByLabelText('Hospital / blood bank'), 'City Blood Bank');
  };

  it('requires date and location', async () => {
    view();
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    expect(await screen.findByText('Donation date is required')).toBeInTheDocument();
    expect(h.apiPost).not.toHaveBeenCalled();
  });

  it('rejects unsupported file types and files over 5 MB', async () => {
    view();
    const input = screen.getByTestId('file-input');
    await userEvent.upload(input, file('virus.exe', 'application/x-msdownload'), { applyAccept: false });
    expect(await screen.findByText('Only PDF, JPG or PNG files are allowed.')).toBeInTheDocument();
    await userEvent.upload(input, file('big.pdf', 'application/pdf', 5 * 1024 * 1024 + 1));
    expect(await screen.findByText(/too large/i)).toBeInTheDocument();
  });

  it('refuses to submit without a file', async () => {
    view();
    await fillForm();
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    expect(await screen.findByText('Please choose your certificate file.')).toBeInTheDocument();
    expect(h.apiPost).not.toHaveBeenCalled();
  });

  it('uploads multipart form data and then shows the pending confirmation', async () => {
    h.apiPost.mockResolvedValue({ data: {} });
    view();
    await fillForm();
    await userEvent.upload(screen.getByTestId('file-input'), file('cert.pdf', 'application/pdf'));
    await userEvent.click(screen.getByRole('button', { name: /submit for review/i }));
    await waitFor(() => expect(h.apiPost).toHaveBeenCalledTimes(1));
    const [url, fd] = h.apiPost.mock.calls[0];
    expect(url).toBe('/certificates/upload');
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('donationDate')).toBe('2025-01-10');
    expect(fd.get('location')).toBe('City Blood Bank');
    expect((fd.get('certificate') as File).name).toBe('cert.pdf');
    expect(await screen.findByText('Certificate submitted')).toBeInTheDocument();
  });
});

describe('certificate review workflow (admin)', () => {
  const cert = { _id: 'c1', status: 'PENDING', originalName: 'cert.pdf', createdAt: '2025-01-11T10:00:00Z', donor: { fullName: 'Asha Rao', email: 'asha@example.com' }, donation: { donationDate: '2025-01-10T12:00:00Z', location: 'City Blood Bank', bloodGroup: 'O+' } };
  const setup = () => {
    h.getPaged.mockResolvedValue({ items: [cert], meta: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    h.get.mockResolvedValue({ url: 'https://b2.test/c1?sig=1', mimeType: 'application/pdf', expiresIn: 300 });
    h.post.mockResolvedValue({});
    render(<MemoryRouter><AdminCertificates /></MemoryRouter>);
  };

  it('lists pending certificates and approves one from the preview dialog', async () => {
    setup();
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0);
    expect(h.getPaged).toHaveBeenCalledWith('/certificates', expect.objectContaining({ status: 'PENDING' }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0]);
    const dlg = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dlg).getByTitle('Donation certificate')).toHaveAttribute('src', 'https://b2.test/c1?sig=1'));
    expect(h.get).toHaveBeenCalledWith('/certificates/c1/download', { inline: '1' });
    await userEvent.click(within(dlg).getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/certificates/c1/approve', {}));
  });

  it('requires a reason (min 5 chars) before rejecting', async () => {
    setup();
    await userEvent.click((await screen.findAllByRole('button', { name: 'Review' }))[0]);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: /^reject/i }));
    const confirm = within(dlg).getByRole('button', { name: /confirm reject/i });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dlg).getByLabelText('Rejection reason'), 'abc');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dlg).getByLabelText('Rejection reason'), 'def');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(h.post).toHaveBeenCalledWith('/certificates/c1/reject', { reason: 'abcdef' }));
    expect(h.post).not.toHaveBeenCalledWith('/certificates/c1/approve', expect.anything());
  });
});

describe('DataTable', () => {
  const cols: Column<{ _id: string; name: string }>[] = [{ key: 'n', header: 'Name', cell: (r) => r.name }];
  it('shows skeleton rows while loading, then data, then paginates', async () => {
    const onPage = vi.fn();
    const { rerender, container } = render(<DataTable columns={cols} rows={null} loading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    rerender(<DataTable columns={cols} rows={[{ _id: '1', name: 'Alpha' }]} meta={{ page: 1, totalPages: 3, total: 25 }} onPage={onPage} />);
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    expect(screen.getByText(/25 results/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it('renders an empty state and an error with retry', async () => {
    const retry = vi.fn();
    const { rerender } = render(<DataTable columns={cols} rows={[]} empty={<p>Nothing to show</p>} />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    rerender(<DataTable columns={cols} rows={[]} error="Boom" onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: (r: string) => void }) {
    const [open, setOpen] = useState(true);
    return <ConfirmDialog open={open} onOpenChange={setOpen} title="Reject?" askReason minReason={5} confirmLabel="Do it" onConfirm={onConfirm} />;
  }
  it('blocks confirmation until a long enough reason is typed, then passes it through', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    const btn = screen.getByRole('button', { name: 'Do it' });
    expect(btn).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), '  blurry scan ');
    expect(btn).toBeEnabled();
    await userEvent.click(btn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('blurry scan'));
  });
  it('cancel closes without confirming', async () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('formats dates and relative time', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('2025-03-05T12:00:00Z')).toMatch(/05 Mar 2025/);
    expect(timeAgo(new Date(Date.now() - 5 * 60_000))).toBe('5m ago');
    expect(daysLeft(new Date(Date.now() + 3 * 86400_000 - 1000))).toBe(3);
    expect(initials('asha rao kumar')).toBe('AR');
  });
  it('maps statuses to colour tones', () => {
    render(<><StatusBadge status="VERIFIED" /><StatusBadge status="REJECTED" /><StatusBadge status="PENDING" /></>);
    expect(screen.getByText('VERIFIED').className).toMatch(/success/);
    expect(screen.getByText('REJECTED').className).toMatch(/destructive/);
    expect(screen.getByText('PENDING').className).toMatch(/warning/);
  });
});
