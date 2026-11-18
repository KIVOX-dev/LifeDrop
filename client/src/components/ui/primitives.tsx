import { Slot } from '@radix-ui/react-slot';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn, statusTone } from '@/lib/utils';

/* ---------------------------------- Button ---------------------------------- */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-[transform,background-color,box-shadow,color] duration-500 ease-fluid active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_10px_24px_-10px_rgba(185,28,53,.7)] hover:bg-primary-dark',
        outline: 'bg-white/80 text-foreground ring-1 ring-black/10 hover:bg-white hover:ring-black/20',
        ghost: 'hover:bg-muted text-foreground',
        soft: 'bg-accent text-accent-foreground hover:bg-primary/15',
        destructive: 'bg-destructive text-white hover:bg-red-800',
        success: 'bg-success text-white hover:bg-green-800',
      },
      size: { default: 'h-11 px-4 sm:h-10', sm: 'h-9 px-3 text-xs sm:h-8', lg: 'h-12 px-6 text-base', icon: 'h-11 w-11 sm:h-10 sm:w-10' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? children : (<>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>)}
    </Comp>
  );
});
Button.displayName = 'Button';

/* ----------------------------------- Inputs ----------------------------------- */
const field = 'w-full rounded-xl border border-black/10 bg-white/90 px-3.5 transition-shadow duration-500 ease-fluid focus:shadow-[0_0_0_4px_hsl(var(--primary)/.12)] text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted aria-[invalid=true]:border-destructive';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, 'h-11 sm:h-10', className)} {...p} />
));
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, 'min-h-[88px] py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn(field, 'h-11 pr-8 sm:h-10', className)} {...p}>{children}</select>
));
Select.displayName = 'Select';

export const Label = forwardRef<HTMLLabelElement, LabelPrimitive.LabelProps>(({ className, ...p }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...p} />
));
Label.displayName = 'Label';

/** Label + control + error message wired for accessibility. */
export function Field({ label, error, hint, htmlFor, children, className }: { label: string; error?: string; hint?: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export const Switch = forwardRef<HTMLButtonElement, SwitchPrimitive.SwitchProps>(({ className, ...p }, ref) => (
  <SwitchPrimitive.Root ref={ref} className={cn('relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-primary disabled:opacity-50', className)} {...p}>
    <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

/* ------------------------------------ Card ------------------------------------ */
export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('card', className)} {...p} />;
export const CardHeader = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-start justify-between gap-3 p-5 pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }: HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-base font-semibold', className)} {...p} />;
export const CardContent = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 pt-2', className)} {...p} />;

/* ------------------------------------ Badge ------------------------------------ */
const tones = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-blue-50 text-blue-700',
  brand: 'bg-accent text-accent-foreground',
} as const;
export function Badge({ tone = 'neutral', className, children }: { tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={statusTone[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;

export const BloodBadge = ({ group }: { group: string }) => (
  <span className="inline-flex h-8 min-w-[2.75rem] items-center justify-center rounded-full bg-primary px-2 text-sm font-bold text-white">{group === 'ALL' ? 'All' : group}</span>
);

/* ---------------------------------- Skeleton ---------------------------------- */
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn('animate-pulse rounded-md bg-slate-200/80', className)} />;
