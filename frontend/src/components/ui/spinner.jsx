import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className, ...props }) {
    return <Loader2 className={cn('animate-spin text-muted-foreground', className)} {...props} />;
}
