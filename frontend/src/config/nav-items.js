import {
    LayoutDashboard,
    QrCode,
    Users,
    Building2,
    UtensilsCrossed,
    FolderOpen,
    ImagePlus,
    GraduationCap,
    PieChart,
    Wallet,
    Megaphone,
} from 'lucide-react';

/**
 * Sidebar navigation config
 * `can` parametresi RBAC kontrolü sağlar
 */
export function getNavGroups(can, role) {
    const groups = [
        {
            id: 1,
            label: 'Ana Menü',
            items: [
                { title: 'Genel Bakış', url: '/admin', icon: LayoutDashboard, end: true },
                ...(role === 'sube_sahibi' ? [
                    { title: 'Reklam', url: '/admin/reklam', icon: Megaphone },
                ] : []),
                ...(role === 'admin' ? [{ title: 'Medya', url: '/admin/medya', icon: ImagePlus }] : []),
                { title: 'Akademi', url: '/admin/akademi', icon: GraduationCap },
                {
                    title: 'QR Menü',
                    url: '/admin/qr-menu',
                    icon: QrCode,
                    subItems: [
                        { title: 'Ürünler', url: '/admin/qr-menu', icon: UtensilsCrossed, end: true },
                        ...(can('categories.create')
                            ? [{ title: 'Kategoriler', url: '/admin/qr-menu/kategoriler', icon: FolderOpen }]
                            : []),
                    ],
                },
            ],
        },
    ];

    if (role === 'admin') {
        groups.push({
            id: 1.5,
            label: 'Reklam',
            items: [
                { title: 'Raporlar', url: '/admin/raporlar', icon: PieChart },
                { title: 'Bütçe', url: '/admin/butce-kampanyalari', icon: Wallet }
            ]
        });
    }

    if (can('users.view')) {
        const userItems = [
            { title: role === 'sube_sahibi' ? 'Çalışanlar' : 'Kullanıcılar', url: '/admin/kullanicilar', icon: Users }
        ];

        if (role === 'admin') {
            userItems.push({ title: 'Şubeler', url: '/admin/subeler', icon: Building2 });
        }

        groups.push({
            id: 2,
            label: 'Yönetim',
            items: userItems,
        });
    }

    return groups;
}
