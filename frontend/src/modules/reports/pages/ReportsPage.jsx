export default function ReportsPage() {
    return (
        <div style={{ width: '100%', height: 'calc(100vh - 73px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <iframe 
                src="/reports/index.html" 
                style={{ width: '100%', flex: 1, border: 'none' }}
                title="Sütlüce Rapor Yönetimi"
            />
        </div>
    );
}
