const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = 3000;

// Supabase Configuration
const supabaseUrl = 'https://izphctaftgaopqijetkp.supabase.co';
const supabaseKey = 'sb_publishable_SurU_W9s_wCBQUxxwwztfQ_AmJWvIte';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landingpage.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(__dirname, 'userinterface.html'));
});

// ==================== ADD ACTIVITY ====================
app.post('/api/add-activity', async (req, res) => {
    try {
        const { title, category, priority, score, description, status, userId } = req.body;
        
        console.log('\n📥 NEW ACTIVITY FOR:', userId);
        console.log('Title:', title);
        
        if (!title || title.trim() === '') {
            return res.json({ success: false, message: "Title required!" });
        }

        if (!userId) {
            return res.json({ success: false, message: "User ID required!" });
        }

        const activityId = Date.now().toString();
        const activityData = {
            id: activityId,
            title: title.trim(),
            category: category || 'personal',
            priority: priority || 'medium',
            score: parseInt(score) || 0,
            description: description || '',
            status: status || 'incomplete',
            user_id: userId,
            firebase_uid: userId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        // Save to Supabase
        const { data, error } = await supabase
            .from('activities')
            .insert([activityData])
            .select();
        
        if (error) {
            console.error('❌ Supabase Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database error: " + error.message 
            });
        }
        
        console.log('✅ Saved to Supabase:', data[0].id);
        
        // Send to C++ - ADD COMMAND
        const args = [
            "add",
            `"${activityId}"`,
            `"${activityData.title}"`,
            `"${activityData.category}"`,
            `"${activityData.priority}"`,
            `"${activityData.score.toString()}"`,
            `"${activityData.description.substring(0, 50)}"`,
            `"${activityData.status}"`,
            `"${userId}"`
        ];
        
        console.log('📤 Sending to C++:', args);
        
        const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (require('fs').existsSync(cppExe)) {
            const cppProcess = spawn(cppExe, args, { shell: true });
            cppProcess.stdout.on('data', (data) => {
                console.log('✅ C++:', data.toString().trim());
            });
        }
        
        res.json({ 
            success: true, 
            message: "Activity saved to database!", 
            data: activityData 
        });
        
    } catch (error) {
        console.error('❌ Server Error:', error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// ==================== UPDATE ACTIVITY ====================
app.post('/api/update-activity', async (req, res) => {
    try {
        const { activityId, title, category, priority, score, description, status, userId } = req.body;
        
        console.log('\n📝 UPDATE REQUEST:');
        console.log('Activity ID received:', activityId);
        console.log('User ID:', userId);
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        if (!title || title.trim() === '') {
            return res.json({ success: false, message: "Title required!" });
        }
        
        // STEP 1: FLEXIBLE ACTIVITY FINDING
        let foundActivity = null;
        let searchMethod = '';
        
        // TRY 1: Exact ID match
        let { data: exactMatch, error: exactError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .eq('user_id', userId)
            .maybeSingle();
        
        if (!exactError && exactMatch) {
            foundActivity = exactMatch;
            searchMethod = 'exact_id';
            console.log('✅ Found with exact ID match');
        }
        
        // TRY 2: If not found, search by partial ID
        if (!foundActivity && activityId.length <= 10) {
            console.log('🔍 Searching with partial ID match:', activityId);
            
            const { data: allActivities, error: listError } = await supabase
                .from('activities')
                .select('*')
                .eq('user_id', userId);
            
            if (!listError && allActivities && allActivities.length > 0) {
                foundActivity = allActivities.find(activity => {
                    const dbId = activity.id.toLowerCase();
                    const searchId = activityId.toLowerCase();
                    
                    return dbId.endsWith(searchId) || 
                           dbId.includes(searchId) ||
                           activity.id.slice(-6).toLowerCase() === activityId.toLowerCase();
                });
                
                if (foundActivity) {
                    searchMethod = 'partial_id';
                    console.log('✅ Found with partial ID match');
                    console.log('Full ID:', foundActivity.id);
                }
            }
        }
        
        // STEP 2: ACTIVITY NOT FOUND HANDLING
        if (!foundActivity) {
            console.log('❌ Activity not found with ID:', activityId);
            
            const { data: recentActivities } = await supabase
                .from('activities')
                .select('id, title, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(5);
            
            return res.json({ 
                success: false, 
                message: `Activity not found with ID: ${activityId}`,
                suggestion: "Use the full Activity ID from your activities table",
                recentActivities: recentActivities || []
            });
        }
        
        // STEP 3: PREPARE UPDATE DATA
        const updateData = {
            title: title.trim(),
            category: category || foundActivity.category,
            priority: priority || foundActivity.priority,
            score: parseInt(score) || foundActivity.score || 0,
            description: description || foundActivity.description || '',
            status: status || foundActivity.status,
            updated_at: new Date().toISOString()
        };
        
        console.log('📤 Update Data:', {
            fromTitle: foundActivity.title,
            toTitle: updateData.title,
            fromStatus: foundActivity.status,
            toStatus: updateData.status
        });
        
        // STEP 4: PERFORM UPDATE IN SUPABASE
        const { data: updatedData, error: updateError } = await supabase
            .from('activities')
            .update(updateData)
            .eq('id', foundActivity.id)
            .eq('user_id', userId)
            .select();
        
        if (updateError) {
            console.error('❌ Update Error:', updateError);
            return res.status(500).json({ 
                success: false, 
                message: "Database update failed: " + updateError.message 
            });
        }
        
        console.log('✅ Successfully updated activity');
        
        // STEP 5: SEND TO C++
        if (foundActivity) {
            const args = [
                "update",
                `"${foundActivity.id}"`,
                `"${updateData.title}"`,
                `"${updateData.category}"`,
                `"${updateData.priority}"`,
                `"${updateData.score.toString()}"`,
                `"${updateData.description.substring(0, 50)}"`,
                `"${updateData.status}"`,
                `"${userId}"`,
                `"${foundActivity.title}"`,
                `"${foundActivity.category}"`,
                `"${foundActivity.priority}"`,
                `"${foundActivity.score.toString()}"`,
                `"${foundActivity.description.substring(0, 50)}"`,
                `"${foundActivity.status}"`
            ];
            
            console.log('📤 Sending UPDATE to C++');
            
            const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
            if (require('fs').existsSync(cppExe)) {
                const cppProcess = spawn(cppExe, args, { shell: true });
                cppProcess.stdout.on('data', (data) => {
                    console.log('✅ C++ Response:', data.toString().trim());
                });
            }
        }
        
        // STEP 6: RETURN SUCCESS
        res.json({ 
            success: true, 
            message: "Activity updated successfully!",
            data: updatedData[0],
            searchMethod: searchMethod,
            note: `Updated using ${searchMethod === 'exact_id' ? 'full ID' : 'partial ID match'}`
        });
        
    } catch (error) {
        console.error('❌ Update Error:', error);
        res.status(500).json({ 
            success: false, 
            message: "Server error: " + error.message 
        });
    }
});

// ==================== GET ACTIVITY BY ID ====================
app.get('/api/get-activity', async (req, res) => {
    try {
        const { activityId, userId } = req.query;
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required" });
        }
        
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .eq('user_id', userId)
            .single();
        
        if (error || !data) {
            return res.json({ success: false, message: "Activity not found" });
        }
        
        res.json({ 
            success: true, 
            activity: data 
        });
        
    } catch (error) {
        console.error('❌ Error getting activity:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== DELETE ACTIVITY ====================
// ==================== DELETE ACTIVITY ====================
app.post('/api/delete-activity', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n🗑️ DELETE REQUEST:');
        console.log('Activity ID:', activityId);
        console.log('User ID:', userId);
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // First get activity before deleting (for undo if needed)
        const { data: activityToDelete, error: fetchError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .eq('user_id', userId)
            .single();
        
        if (fetchError || !activityToDelete) {
            return res.json({ success: false, message: "Activity not found or access denied" });
        }
        
        // Delete from Supabase
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId)
            .eq('user_id', userId);
        
        if (error) {
            console.error('❌ Delete Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database delete error" 
            });
        }
        
        console.log('✅ Deleted from Supabase');
        
        // Send to C++ - DELETE COMMAND
        const args = [
            "delete",
            `"${activityId}"`
        ];
        
        console.log('📤 Sending DELETE to C++:', args);
        
        const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (require('fs').existsSync(cppExe)) {
            const cppProcess = spawn(cppExe, args, { shell: true });
            cppProcess.stdout.on('data', (data) => {
                console.log('✅ C++:', data.toString().trim());
            });
        }
        
        res.json({ 
            success: true, 
            message: "Activity deleted!",
            deletedActivity: activityToDelete
        });
        
    } catch (error) {
        console.error('❌ Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== PERMANENT DELETE ACTIVITY ====================
app.post('/api/permanent-delete', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n🔥 PERMANENT DELETE REQUEST:');
        console.log('Activity ID:', activityId);
        console.log('User ID:', userId);
        
        if (!activityId || !userId) {
            return res.json({ 
                success: false, 
                message: "Activity ID and User ID required!" 
            });
        }
        
        // ✅ STEP 1: Find activity by ID only
        const { data: activityToDelete, error: fetchError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .single();
        
        if (fetchError || !activityToDelete) {
            return res.json({ 
                success: false, 
                message: "Activity not found" 
            });
        }
        
        // ✅ STEP 2: Verify ownership (case-insensitive)
        if (activityToDelete.user_id.toLowerCase() !== userId.toLowerCase()) {
            console.log('❌ Ownership mismatch:', {
                db_user_id: activityToDelete.user_id,
                req_user_id: userId
            });
            return res.json({ 
                success: false, 
                message: "Access denied: Not your activity" 
            });
        }
        
        // ✅ STEP 3: Permanent delete from Supabase
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId);
        
        if (error) {
            console.error('❌ Permanent Delete Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database delete error: " + error.message 
            });
        }
        
        console.log('🔥 PERMANENTLY Deleted from Supabase');
        console.log('✅ Deleted Activity:', activityToDelete.title);
        
        // ✅ STEP 4: Send to C++ 
        const args = [
            "permanent-delete",
            `"${activityId}"`,
            `"${activityToDelete.title}"`
        ];
        
        console.log('📤 Sending PERMANENT DELETE to C++:', args);
        
        const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (require('fs').existsSync(cppExe)) {
            const cppProcess = spawn(cppExe, args, { shell: true });
            cppProcess.stdout.on('data', (data) => {
                console.log('🔥 C++:', data.toString().trim());
            });
            
            cppProcess.stderr.on('data', (data) => {
                console.error('C++ Error:', data.toString());
            });
        }
        
        // ✅ STEP 5: Return success
        res.json({ 
            success: true, 
            message: "Activity PERMANENTLY deleted! Can't be undone.",
            deletedActivity: activityToDelete
        });
        
    } catch (error) {
        console.error('❌ Permanent Delete Error:', error);
        res.status(500).json({ 
            success: false, 
            message: "Server error: " + error.message 
        });
    }
});
// ==================== UNDO DELETE WITH DATABASE ====================
app.post('/api/undo-delete', async (req, res) => {
    try {
        const { activity, userId } = req.body;
        
        console.log('\n↩️ UNDO DELETE REQUEST WITH DATABASE');
        console.log('Activity:', activity.title);
        console.log('User ID:', userId);
        
        if (!activity || !userId) {
            return res.json({ success: false, message: "Activity and User ID required!" });
        }
        
        // Insert the deleted activity back to database
        const { data, error } = await supabase
            .from('activities')
            .insert([{
                ...activity,
                user_id: userId,
                firebase_uid: userId,
                updated_at: new Date().toISOString()
            }])
            .select();
        
        if (error) {
            console.error('❌ Undo Insert Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database undo error" 
            });
        }
        
        console.log('✅ Activity restored to database');
        
        res.json({ 
            success: true, 
            message: "Activity restored to database!",
            data: data[0]
        });
        
    } catch (error) {
        console.error('❌ Undo Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== REDO DELETE WITH DATABASE ====================
app.post('/api/redo-delete', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n↪️ REDO DELETE REQUEST WITH DATABASE');
        console.log('Activity ID:', activityId);
        console.log('User ID:', userId);
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // Delete from database again
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId)
            .eq('user_id', userId);
        
        if (error) {
            console.error('❌ Redo Delete Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database redo error" 
            });
        }
        
        console.log('✅ Activity deleted again from database');
        
        res.json({ 
            success: true, 
            message: "Activity deleted again from database!"
        });
        
    } catch (error) {
        console.error('❌ Redo Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== GET USER ACTIVITIES ====================
app.get('/api/user-activities', async (req, res) => {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.json({ success: false, message: "User ID required" });
        }
        
        const { data, error } = await supabase
            .from('activities')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('❌ Supabase Error:', error);
            return res.status(500).json({ 
                success: false, 
                message: "Database error" 
            });
        }
        
        console.log(`📤 Sending ${data?.length || 0} activities for user: ${userId}`);
        
        res.json({ 
            success: true, 
            activities: data || [] 
        });
        
    } catch (error) {
        console.error('❌ Error loading activities:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== UNDO (C++ Only) ====================
app.post('/api/undo', async (req, res) => {
    try {
        console.log('\n↩️ UNDO REQUEST (C++)');
        
        // Send to C++ - UNDO COMMAND
        const args = ["undo"];
        
        console.log('📤 Sending UNDO to C++');
        
        const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (require('fs').existsSync(cppExe)) {
            const cppProcess = spawn(cppExe, args, { shell: true });
            
            let output = '';
            cppProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('✅ C++:', data.toString().trim());
            });
            
            cppProcess.on('close', () => {
                const success = !output.includes('NOTHING TO UNDO');
                res.json({ 
                    success: success, 
                    message: success ? "Undo successful" : "Nothing to undo" 
                });
            });
        } else {
            res.json({ 
                success: false, 
                message: "C++ program not found" 
            });
        }
        
    } catch (error) {
        console.error('❌ Undo Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== REDO (C++ Only) ====================
app.post('/api/redo', async (req, res) => {
    try {
        console.log('\n↪️ REDO REQUEST (C++)');
        
        // Send to C++ - REDO COMMAND
        const args = ["redo"];
        
        console.log('📤 Sending REDO to C++');
        
        const cppExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (require('fs').existsSync(cppExe)) {
            const cppProcess = spawn(cppExe, args, { shell: true });
            
            let output = '';
            cppProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('✅ C++:', data.toString().trim());
            });
            
            cppProcess.on('close', () => {
                const success = !output.includes('NOTHING TO REDO');
                res.json({ 
                    success: success, 
                    message: success ? "Redo successful" : "Nothing to redo" 
                });
            });
        } else {
            res.json({ 
                success: false, 
                message: "C++ program not found" 
            });
        }
        
    } catch (error) {
        console.error('❌ Redo Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== HANDLE C++ PERMANENT DELETE ====================
app.post('/api/cpp-permanent-delete', async (req, res) => {
    try {
        const { activityId, title } = req.body;
        
        console.log('\n🔥 C++ PERMANENT DELETE REQUEST:');
        console.log('Activity ID:', activityId);
        console.log('Title:', title);
        
        if (!activityId) {
            return res.json({ success: false, message: "Activity ID required!" });
        }
        
        // Log the permanent delete (we don't need to do anything else since it's already deleted)
        console.log(`🔥 C++ confirmed permanent delete of: ${title} (ID: ${activityId})`);
        
        res.json({ 
            success: true, 
            message: "Permanent delete logged successfully"
        });
        
    } catch (error) {
        console.error('❌ C++ Permanent Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== TEST ENDPOINTS ====================
app.get('/api/test', (req, res) => {
    console.log('✅ Test route called');
    res.json({ 
        success: true, 
        message: "Server running with Supabase!",
        supabase: "Connected",
        features: {
            permanent_delete: "✅ Available",
            undo_redo: "✅ Available",
            database: "Supabase"
        }
    });
});

app.get('/api/test-supabase', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('activities')
            .select('count')
            .limit(1);
        
        if (error) {
            return res.json({ 
                success: false, 
                message: "Supabase connection failed",
                error: error.message 
            });
        }
        
        res.json({ 
            success: true, 
            message: "Supabase connected successfully!",
            data: data 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            message: "Supabase test error",
            error: error.message 
        });
    }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        features: {
            permanent_delete: 'active',
            undo_redo: 'active',
            cpp_integration: 'active'
        }
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`👉 App: http://localhost:${PORT}/app`);
    console.log(`📌 Supabase URL: ${supabaseUrl}`);
    console.log(`\n🔥 NEW FEATURE: PERMANENT DELETE`);
    console.log(`📌 Permanent Delete: POST http://localhost:${PORT}/api/permanent-delete`);
    console.log(`📌 Regular Delete: POST http://localhost:${PORT}/api/delete-activity`);
    console.log(`📌 Undo Delete: POST http://localhost:${PORT}/api/undo-delete`);
    console.log(`📌 Redo Delete: POST http://localhost:${PORT}/api/redo-delete`);
    console.log(`\n✅ Permanent Delete Feature Fully Integrated!`);
    console.log(`   - Frontend: Permanent delete button in undo section`);
    console.log(`   - Backend: /api/permanent-delete endpoint`);
    console.log(`   - C++: "permanent-delete" command supported`);
});