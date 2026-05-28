import React, { useState } from 'react';
import { useReportsStore, fmtC } from '../hooks/useReports';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function BranchSidebar() {
    const [search, setSearch] = useState('');
    const branches = useReportsStore((s) => s.branches);
    const activeBranch = useReportsStore((s) => s.activeBranch);
    const selectBranch = useReportsStore((s) => s.selectBranch);
    const loading = useReportsStore((s) => s.loading);
    const reverseCampaigns = useReportsStore((s) => s.reverseCampaigns);
    const reverseAdsets = useReportsStore((s) => s.reverseAdsets);
    const metaPrefixMappings = useReportsStore((s) => s.metaPrefixMappings);
    const googleMappings = useReportsStore((s) => s.googleMappings);

    const filtered = branches.filter((b) => 
        b.ad.toLowerCase().includes(search.toLowerCase()) || 
        b.kod.toLowerCase().includes(search.toLowerCase())
    );

    const renderSkeletons = () => (
        Array(12).fill(0).map((_, i) => (
            <div key={i} className="p-3 mb-1 rounded-md border border-transparent pointer-events-none">
                <div className="flex justify-between items-center mb-2">
                    <div className="h-3.5 bg-muted rounded animate-pulse w-3/5"></div>
                    <div className="w-4 h-4 rounded-full bg-muted animate-pulse"></div>
                </div>
                <div className="h-2.5 bg-muted/60 rounded animate-pulse w-2/5"></div>
            </div>
        ))
    );

    return (
        <div className="w-[300px] shrink-0 border-r bg-card flex flex-col h-full z-10 overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
                <span className="text-sm font-semibold text-foreground">Şubeler</span>
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                    {loading ? '—' : branches.length}
                </span>
            </div>
            
            <div className="p-3 border-b shrink-0 bg-muted/30">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input 
                        placeholder="Şube veya kod ara..." 
                        className="pl-8 bg-background h-8 text-xs border-border shadow-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 scrollbar-thin min-h-0">
                {loading ? renderSkeletons() : filtered.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">Eşleşen şube bulunamadı.</div>
                ) : filtered.map((s) => {
                    const tS = s.toplamHarcama || 0;
                    const isMetaMapped = 
                        (reverseCampaigns[s.kod]?.length > 0) || 
                        (reverseAdsets[s.kod]?.length > 0) || 
                        Object.values(metaPrefixMappings).some(v => (typeof v === 'object' ? v.sube : v) === s.kod);
                    const isGoogleMapped = Object.values(googleMappings).includes(s.kod);
                    const isActive = activeBranch === s.kod;

                    return (
                        <div 
                            key={s.kod}
                            onClick={() => selectBranch(s.kod)}
                            className={`p-2.5 mb-0.5 cursor-pointer rounded-md text-sm transition-colors relative flex flex-col gap-1 ${
                                isActive 
                                ? 'bg-muted text-foreground' 
                                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                            }`}
                        >
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2/3 bg-primary rounded-r-md" />}
                            
                            <div className="flex justify-between items-center px-1">
                                <span className={`font-medium truncate pr-2 text-[13px] ${isActive ? 'text-foreground' : ''}`}>
                                    {s.ad}
                                </span>
                                {(isMetaMapped || isGoogleMapped) && (
                                    <div className="flex gap-1.5 items-center shrink-0">
                                        {isMetaMapped && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-blue-500" title="Meta ile eşleşti">
                                                <path d="M12 10.2c-.9-1.3-2.1-2.2-3.5-2.7-1.4-.5-2.8-.3-4 .5C3.3 8.8 2.4 10 2 11.5c-.3 1.2-.2 2.4.3 3.5.5 1.1 1.3 2 2.3 2.6.7.4 1.5.6 2.3.6.6 0 1.2-.1 1.7-.3 1.1-.4 2-1.2 2.8-2.2l.6-.8.6.8c.8 1 1.7 1.8 2.8 2.2.5.2 1.1.3 1.7.3.8 0 1.6-.2 2.3-.6 1-.6 1.8-1.5 2.3-2.6.5-1.1.6-2.3.3-3.5-.4-1.5-1.3-2.7-2.5-3.5-1.2-.8-2.6-1-4-.5-1.4.5-2.6 1.4-3.5 2.7z"/>
                                            </svg>
                                        )}
                                        {isGoogleMapped && <MapPin className="w-3 h-3 text-orange-500" title="Google ile eşleşti" />}
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-between items-center px-1 text-[11px] opacity-80">
                                <span>{s.kod}</span>
                                <span>{fmtC(tS)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
