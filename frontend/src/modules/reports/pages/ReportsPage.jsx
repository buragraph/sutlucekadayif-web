export default function ReportsPage() {
    return (
        <div style={{ width: '100%', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            <iframe 
                src="/reports/index.html" 
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Sütlüce Rapor Yönetimi"
            />
        </div>
    );
}
