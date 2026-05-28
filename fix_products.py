import re

with open('frontend/src/modules/qr-menu/pages/ProductsPage.jsx', 'r') as f:
    content = f.read()

# Add imports
imports = """
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
"""
content = re.sub(r'(import .*?lucide-react\';)', r'\1' + imports, content)

# Replace table structure
content = content.replace('<div className="table-container">', '<div className="rounded-md border bg-card text-card-foreground shadow-sm overflow-hidden">')
content = content.replace('<table className="table">', '<Table>')
content = content.replace('</table>', '</Table>')
content = content.replace('<thead>', '<TableHeader>')
content = content.replace('</thead>', '</TableHeader>')
content = content.replace('<tbody>', '<TableBody>')
content = content.replace('</tbody>', '</TableBody>')
content = content.replace('<tr className="table-row">', '<TableRow>')
content = content.replace('<tr>', '<TableRow>')
content = content.replace('</tr>', '</TableRow>')
content = content.replace('<th>', '<TableHead>')
content = content.replace('</th>', '</TableHead>')
content = content.replace('<td>', '<TableCell>')
content = content.replace('</td>', '</TableCell>')
content = content.replace('style={{ width: 48, textAlign: \'center\' }}', 'className="w-12 text-center"')
content = content.replace('style={{ width: 64, textAlign: \'center\' }}', 'className="w-16 text-center"')
content = content.replace('style={{ minWidth: 200 }}', 'className="min-w-[200px]"')
content = content.replace('style={{ width: 120 }}', 'className="w-[120px]"')
content = content.replace('style={{ width: 140 }}', 'className="w-[140px]"')

# Buttons
content = re.sub(r'<button([^>]*?)className="btn btn--primary"([^>]*?)>', r'<Button\1\2>', content)
content = re.sub(r'<button([^>]*?)className="btn btn--secondary"([^>]*?)>', r'<Button variant="outline"\1\2>', content)
content = re.sub(r'<button([^>]*?)className="btn btn--danger"([^>]*?)>', r'<Button variant="destructive"\1\2>', content)
content = content.replace('</button>', '</Button>')

# Modals/Dialogs
content = re.sub(r'<div className="modal-overlay"[^>]*?>', '', content)
content = re.sub(r'<div className="modal-card"[^>]*?>', '<DialogContent className="sm:max-w-[425px]">', content)
content = re.sub(r'<div className="modal-header"[^>]*?>\s*<h2>(.*?)</h2>\s*<Button className="modal-close"[^>]*?>.*?</Button>\s*</div>', r'<DialogHeader><DialogTitle>\1</DialogTitle></DialogHeader>', content)
content = re.sub(r'<div className="modal-actions">\s*(<Button.*?>.*?</Button>)\s*(<Button.*?>.*?</Button>)\s*</div>', r'<DialogFooter>\1\2</DialogFooter>', content)

with open('frontend/src/modules/qr-menu/pages/ProductsPage.jsx', 'w') as f:
    f.write(content)
print("Done")
