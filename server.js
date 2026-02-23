const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000; // Railway ka PORT use karo

// ✅ Supabase Configuration - ENVIRONMENT VARIABLES use karo!
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Agar env variables nahi hain to error do
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: SUPABASE_URL and SUPABASE_KEY environment variables required!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ✅ C++ executable path - Railway ke hisaab se
const getCppExecutable = () => {
    // Railway pe Linux chalta hai
    if (process.platform === 'linux') {
        // Pehle activity executable dhundo
        const linuxExe = path.join(__dirname, 'activity');
        if (fs.existsSync(linuxExe)) {
            return linuxExe;
        }
        // Ya phir activity.exe bhi check karo
        const linuxExeAlt = path.join(__dirname, 'activity.exe');
        if (fs.existsSync(linuxExeAlt)) {
            return linuxExeAlt;
        }
    }
    
    // Windows ke liye (local development)
    if (process.platform === 'win32') {
        const winExe = path.join(__dirname, 'cpp', 'activity.exe');
        if (fs.existsSync(winExe)) {
            return winExe;
        }
        const winExeAlt = path.join(__dirname, 'activity.exe');
        if (fs.existsSync(winExeAlt)) {
            return winExeAlt;
        }
    }
    
    // Last attempt - root folder mein dhundo
    const rootExe = path.join(__dirname, 'activity');
    if (fs.existsSync(rootExe)) {
        return rootExe;
    }
    
    return null;
};

const CPP_EXE = getCppExecutable();
console.log(`🔧 C++ Executable: ${CPP_EXE || 'NOT FOUND'}`);

// Helper function to run C++ commands
const runCpp = (args) => {
    return new Promise((resolve) => {
        if (!CPP_EXE) {
            console.log('⚠️ C++ executable not found, skipping...');
            return resolve({ success: false, output: 'C++ not available' });
        }
        
        try {
            // Make sure executable has permissions
            if (process.platform === 'linux') {
                fs.chmodSync(CPP_EXE, '755');
            }
            
            const cppProcess = spawn(CPP_EXE, args, { shell: true });
            let output = '';
            let error = '';
            
            cppProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('✅ C++:', data.toString().trim());
            });
            
            cppProcess.stderr.on('data', (data) => {
                error += data.toString();
                console.error('❌ C++ Error:', data.toString().trim());
            });
            
            cppProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output });
                } else {
                    resolve({ success: false, output: error || output });
                }
            });
        } catch (err) {
            console.error('❌ Failed to run C++:', err);
            resolve({ success: false, output: err.message });
        }
    });
};

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
        
        // Send to C++
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
        await runCpp(args);
        
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
        
        // Find activity
        let foundActivity = null;
        
        const { data: exactMatch, error: exactError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .eq('user_id', userId)
            .maybeSingle();
        
        if (!exactError && exactMatch) {
            foundActivity = exactMatch;
        }
        
        if (!foundActivity) {
            return res.json({ 
                success: false, 
                message: `Activity not found with ID: ${activityId}`
            });
        }
        
        // Prepare update data
        const updateData = {
            title: title.trim(),
            category: category || foundActivity.category,
            priority: priority || foundActivity.priority,
            score: parseInt(score) || foundActivity.score || 0,
            description: description || foundActivity.description || '',
            status: status || foundActivity.status,
            updated_at: new Date().toISOString()
        };
        
        // Update in Supabase
        const { data: updatedData, error: updateError } = await supabase
            .from('activities')
            .update(updateData)
            .eq('id', foundActivity.id)
            .eq('user_id', userId)
            .select();
        
        if (updateError) {
            return res.status(500).json({ 
                success: false, 
                message: "Database update failed: " + updateError.message 
            });
        }
        
        console.log('✅ Successfully updated activity');
        
        // Send to C++
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
        
        await runCpp(args);
        
        res.json({ 
            success: true, 
            message: "Activity updated successfully!",
            data: updatedData[0]
        });
        
    } catch (error) {
        console.error('❌ Update Error:', error);
        res.status(500).json({ 
            success: false, 
            message: "Server error: " + error.message 
        });
    }
});

// ==================== DELETE ACTIVITY ====================
app.post('/api/delete-activity', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n🗑️ DELETE REQUEST:', { activityId, userId });
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // Get activity before deleting
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
            return res.status(500).json({ 
                success: false, 
                message: "Database delete error" 
            });
        }
        
        console.log('✅ Deleted from Supabase');
        
        // Send to C++
        await runCpp(["delete", `"${activityId}"`]);
        
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

// ==================== PERMANENT DELETE ====================
app.post('/api/permanent-delete', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n🔥 PERMANENT DELETE REQUEST:', { activityId, userId });
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // Find activity
        const { data: activityToDelete, error: fetchError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .single();
        
        if (fetchError || !activityToDelete) {
            return res.json({ success: false, message: "Activity not found" });
        }
        
        // Verify ownership
        if (activityToDelete.user_id.toLowerCase() !== userId.toLowerCase()) {
            return res.json({ success: false, message: "Access denied: Not your activity" });
        }
        
        // Permanent delete
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId);
        
        if (error) {
            return res.status(500).json({ 
                success: false, 
                message: "Database delete error: " + error.message 
            });
        }
        
        console.log('🔥 PERMANENTLY Deleted:', activityToDelete.title);
        
        // Send to C++
        await runCpp(["permanent-delete", `"${activityId}"`, `"${activityToDelete.title}"`]);
        
        res.json({ 
            success: true, 
            message: "Activity PERMANENTLY deleted! Can't be undone.",
            deletedActivity: activityToDelete
        });
        
    } catch (error) {
        console.error('❌ Permanent Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error: " + error.message });
    }
});

// ==================== UNDO DELETE ====================
app.post('/api/undo-delete', async (req, res) => {
    try {
        const { activity, userId } = req.body;
        
        console.log('\n↩️ UNDO DELETE:', { activityTitle: activity?.title, userId });
        
        if (!activity || !userId) {
            return res.json({ success: false, message: "Activity and User ID required!" });
        }
        
        // Restore to database
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

// ==================== REDO DELETE ====================
app.post('/api/redo-delete', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
        console.log('\n↪️ REDO DELETE:', { activityId, userId });
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // Delete again
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId)
            .eq('user_id', userId);
        
        if (error) {
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
            return res.status(500).json({ 
                success: false, 
                message: "Database error" 
            });
        }
        
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
        
        const result = await runCpp(["undo"]);
        
        res.json({ 
            success: result.success, 
            message: result.success ? "Undo successful" : "Nothing to undo" 
        });
        
    } catch (error) {
        console.error('❌ Undo Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== REDO (C++ Only) ====================
app.post('/api/redo', async (req, res) => {
    try {
        console.log('\n↪️ REDO REQUEST (C++)');
        
        const result = await runCpp(["redo"]);
        
        res.json({ 
            success: result.success, 
            message: result.success ? "Redo successful" : "Nothing to redo" 
        });
        
    } catch (error) {
        console.error('❌ Redo Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== TEST ENDPOINTS ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: "Server running on Railway!",
        environment: process.env.NODE_ENV || 'development',
        cpp_available: !!CPP_EXE,
        cpp_path: CPP_EXE,
        platform: process.platform,
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
            message: "Supabase connected successfully!"
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
        cpp: CPP_EXE ? 'available' : 'not found',
        features: {
            permanent_delete: 'active',
            undo_redo: 'active',
            cpp_integration: CPP_EXE ? 'active' : 'disabled'
        }
    });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════════');
    console.log(`🚀 TASKPULSE DEPLOYED ON RAILWAY!`);
    console.log(`📌 PORT: ${PORT}`);
    console.log(`📌 Platform: ${process.platform}`);
    console.log(`📌 C++ Executable: ${CPP_EXE || '⚠️ NOT FOUND'}`);
    console.log(`📌 Supabase: ${supabaseUrl ? '✅ Configured' : '❌ Missing URL'}`);
    console.log('═══════════════════════════════════════════════\n');
});