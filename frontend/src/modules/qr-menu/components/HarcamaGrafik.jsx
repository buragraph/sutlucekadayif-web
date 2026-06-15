import { Area, CartesianGrid, ComposedChart, Line, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import { cn } from '@/lib/utils';

const chartConfig = {
    harcama: { label: 'Harcama', color: 'var(--chart-1)' },
    butce: { label: 'Bütçe', color: 'var(--chart-3)' },
};

const fmtAy = (d) => {
    try {
        return new Date(d).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
    } catch {
        return d;
    }
};
const fmtTarih = (d) => {
    try {
        return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
        return d;
    }
};
const fmtTutar = (v) => new Intl.NumberFormat('tr-TR').format(Math.round(v || 0)) + ' ₺';

/**
 * Şube sahibinin geçmiş dönem harcama/bütçe alan grafiği.
 * Veri donem_ozetleri'nden (harcama + bütçe alanları) gelir — ekstra Firestore okuması yok.
 * Dönemler kronolojik (eskiden yeniye) sıralanır.
 */
export default function HarcamaGrafik({ donemler = [], className }) {
    const data = [...donemler]
        .sort((a, b) => (a.baslangic < b.baslangic ? -1 : 1))
        .map((o) => ({
            donem: o.baslangic,
            harcama: o.harcama || 0,
            butce: (o.planlanan_butce || 0) + (o.devredilen_miktar || 0) + (o.merkez_destegi || 0),
        }));

    if (data.length === 0) return null;

    return (
        <Card className={cn('flex h-full flex-col', className)}>
            <CardHeader>
                <CardTitle className="leading-none">Harcama Özeti</CardTitle>
                <CardDescription>Tamamlanmış dönemlerin reklam harcaması ve bütçesi</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
                <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[280px] w-full">
                    <ComposedChart data={data} margin={{ top: 0, left: 12, right: 12 }}>
                        <defs>
                            <linearGradient id="fillHarcama" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-harcama)" stopOpacity={0.36} />
                                <stop offset="95%" stopColor="var(--color-harcama)" stopOpacity={0.04} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeOpacity={0.5} />
                        <XAxis
                            dataKey="donem"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={24}
                            tickFormatter={fmtAy}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    className="w-52"
                                    indicator="line"
                                    labelFormatter={(_, payload) => fmtTarih(payload?.[0]?.payload?.donem)}
                                    formatter={(value, name) => (
                                        <div className="flex flex-1 items-center justify-between gap-3">
                                            <span className="text-muted-foreground">{chartConfig[name]?.label ?? name}</span>
                                            <span className="font-mono font-medium text-foreground tabular-nums">{fmtTutar(value)}</span>
                                        </div>
                                    )}
                                />
                            }
                        />
                        <ChartLegend verticalAlign="top" content={<ChartLegendContent className="mb-4 justify-end" />} />
                        <Area
                            dataKey="harcama"
                            type="natural"
                            fill="url(#fillHarcama)"
                            stroke="var(--color-harcama)"
                            strokeWidth={1.5}
                            dot={false}
                            fillOpacity={1}
                        />
                        <Line
                            dataKey="butce"
                            type="natural"
                            stroke="var(--color-butce)"
                            strokeWidth={1.4}
                            strokeDasharray="4 4"
                            dot={false}
                        />
                    </ComposedChart>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
