const fs = require('fs');
let content = fs.readFileSync('frontend/public/reports/index.html', 'utf8');
content = content.replace(/fetch\('\/api\//g, "fetch('http://localhost:5001/api/reports/");
content = content.replace(/fetch\(\`\/api\//g, "fetch(`http://localhost:5001/api/reports/");
content = content.replace(/'\/auth\/google'/g, "'http://localhost:5001/api/reports/auth/google'");
fs.writeFileSync('frontend/public/reports/index.html', content);
