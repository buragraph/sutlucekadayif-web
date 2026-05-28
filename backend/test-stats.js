import { db, auth } from './config/firebase.js';

async function test() {
    try {
        const subeSnap = await db.collection('kullanici_sube').get();
        const subeMap = {};
        subeSnap.forEach(doc => { subeMap[doc.id] = doc.data(); });
    
        const progressRef = db.collection('academy_progress');
        const userDocRefs = await progressRef.listDocuments();
        
        console.log("Found userDocRefs:", userDocRefs.length);
        
        const userIds = userDocRefs.map(ref => ref.id);
        const authUsersMap = {};
        for (let i = 0; i < userIds.length; i += 100) {
            const chunk = userIds.slice(i, i + 100);
            if (chunk.length === 0) continue; // safety check
            const authResult = await auth.getUsers(chunk.map(uid => ({ uid })));
            authResult.users.forEach(u => {
                authUsersMap[u.uid] = {
                    displayName: u.displayName || null,
                    email: u.email || null,
                };
            });
        }
        
        console.log("Auth users mapped:", Object.keys(authUsersMap).length);
        
        const stats = [];
        for (const userDocRef of userDocRefs) {
            const userId = userDocRef.id;
            const userDocSnap = await userDocRef.get();
            let data = userDocSnap.exists ? userDocSnap.data() : {};
    
            if (!data.statsMigrated) {
                console.log("Migrating", userId);
                // fake migration
                data = { totalCompleted: 0, lastActivity: null, byCourse: {}, statsMigrated: true };
            }
            
            const userInfo = authUsersMap[userId] || { displayName: null, email: null };
            const subeData = subeMap[userId] || {};
            
            stats.push({
                userId,
                displayName: userInfo.displayName,
                email: userInfo.email,
                subeSlug: subeData.sube_slug || null,
                role: subeData.role || null,
                totalCompleted: data.totalCompleted || 0,
                lastActivity: data.lastActivity || null,
                byCourse: data.byCourse || {},
            });
        }
        
        console.log("Stats array length:", stats.length);
        console.log("Sample:", stats[0]);
    } catch (e) {
        console.error("ERROR:", e);
    }
    process.exit(0);
}
test();
