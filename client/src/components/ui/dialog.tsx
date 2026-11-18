import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { Button, Textarea } from './primitives';

export function Modal({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px]" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
              <Dialog.Description className={description ? 'mt-1 text-sm text-muted-foreground' : 'sr-only'}>{description ?? title}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-5 w-5" /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Confirmation dialog. With `askReason`, a required text reason is collected and passed to onConfirm. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, askReason, reasonLabel = 'Reason', minReason = 5, onConfirm,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; destructive?: boolean;
  askReason?: boolean; reasonLabel?: string; minReason?: number; onConfirm: (reason: string) => Promise<unknown> | unknown;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const invalid = !!askReason && reason.trim().length < minReason;
  return (
    <Modal open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setReason(''); } }} title={title} description={description}>
      {askReason && (
        <div className="mb-4 space-y-1.5">
          <label htmlFor="confirm-reason" className="text-sm font-medium">{reasonLabel}</label>
          <Textarea id="confirm-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Explain briefly…" />
          <p className="text-xs text-muted-foreground">Minimum {minReason} characters. This is shown to the donor.</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          loading={busy}
          disabled={invalid}
          onClick={async () => {
            setBusy(true);
            try { await onConfirm(reason.trim()); onOpenChange(false); setReason(''); } finally { setBusy(false); }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
