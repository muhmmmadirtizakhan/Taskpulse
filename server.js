const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERROR: SUPABASE_URL and SUPABASE_KEY environment variables required!');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ✅ FIXED: C++ executable path for Railway
const getCppExecutable = () => {
    console.log('🔍 Looking for C++ executable...');
    
    const possiblePaths = [
        path.join(__dirname, 'activity'),        // Linux (Railway)
        path.join(__dirname, 'activity.exe'),    // Windows
        '/app/activity',                          // Railway absolute path
        path.join(__dirname, 'cpp', 'activity'),  // cpp folder
        path.join(__dirname, 'cpp', 'activity.exe')
    ];
    
    for (const exePath of possiblePaths) {
        try {
            if (fs.existsSync(exePath)) {
                console.log(`✅ C++ Found at: ${exePath}`);
                // Make executable on Linux
                if (process.platform === 'linux') {
                    try {
                        fs.chmodSync(exePath, '755');
                    } catch (e) {
                        console.log(`⚠️ Cannot chmod: ${e.message}`);
                    }
                }
                return exePath;
            }
        } catch (e) {
            console.log(`⚠️ Check failed for: ${exePath}`);
        }
    }
    
    console.log('⚠️ C++ executable NOT FOUND, continuing without C++');
    return null;
};

const CPP_EXE = getCppExecutable();

// Helper function to run C++
const runCpp = (args) => {
    return new Promise((resolve) => {
        if (!CPP_EXE) {
            console.log('⚠️ C++ not available, skipping...');
            return resolve({ success: false, output: 'C++ not available' });
        }
        
        try {
            console.log(`🚀 Running C++: ${CPP_EXE} ${args.join(' ')}`);
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
        
        if (!activityId || !userId) {
            return res.json({ success: false, message: "Activity ID and User ID required!" });
        }
        
        // Find activity
        const { data: foundActivity, error: findError } = await supabase
            .from('activities')
            .select('*')
            .eq('id', activityId)
            .eq('user_id', userId)
            .single();
        
        if (findError || !foundActivity) {
            return res.json({ success: false, message: "Activity not found" });
        }
        
        // Update data
        const updateData = {
            title: title?.trim() || foundActivity.title,
            category: category || foundActivity.category,
            priority: priority || foundActivity.priority,
            score: parseInt(score) || foundActivity.score,
            description: description || foundActivity.description,
            status: status || foundActivity.status,
            updated_at: new Date().toISOString()
        };
        
        // Update in Supabase
        const { data: updatedData, error: updateError } = await supabase
            .from('activities')
            .update(updateData)
            .eq('id', activityId)
            .eq('user_id', userId)
            .select();
        
        if (updateError) {
            return res.status(500).json({ success: false, message: "Database update failed" });
        }
        
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
        
        res.json({ success: true, message: "Activity updated!", data: updatedData[0] });
        
    } catch (error) {
        console.error('❌ Update Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== DELETE ACTIVITY ====================
app.post('/api/delete-activity', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
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
            return res.json({ success: false, message: "Activity not found" });
        }
        
        // Delete from Supabase
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId)
            .eq('user_id', userId);
        
        if (error) {
            return res.status(500).json({ success: false, message: "Database delete error" });
        }
        
        // Send to C++
        await runCpp(["delete", `"${activityId}"`]);
        
        res.json({ success: true, message: "Activity deleted!", deletedActivity: activityToDelete });
        
    } catch (error) {
        console.error('❌ Delete Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== PERMANENT DELETE ====================
app.post('/api/permanent-delete', async (req, res) => {
    try {
        const { activityId, userId } = req.body;
        
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
        
        // Check ownership
        if (activityToDelete.user_id !== userId) {
            return res.json({ success: false, message: "Access denied" });
        }
        
        // Permanent delete
        const { error } = await supabase
            .from('activities')
            .delete()
            .eq('id', activityId);
        
        if (error) {
            return res.status(500).json({ success: false, message: "Database delete error" });
        }
        
        // Send to C++
        await runCpp(["permanent-delete", `"${activityId}"`, `"${activityToDelete.title}"`]);
        
        res.json({ success: true, message: "Activity permanently deleted!" });
        
    } catch (error) {
        console.error('❌ Permanent Delete Error:', error);
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
            return res.status(500).json({ success: false, message: "Database error" });
        }
        
        res.json({ success: true, activities: data || [] });
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ==================== UNDO ====================
app.post('/api/undo', async (req, res) => {
    const result = await runCpp(["undo"]);
    res.json({ success: result.success, message: result.success ? "Undo successful" : "Nothing to undo" });
});

// ==================== REDO ====================
app.post('/api/redo', async (req, res) => {
    const result = await runCpp(["redo"]);
    res.json({ success: result.success, message: result.success ? "Redo successful" : "Nothing to redo" });
});

// ==================== TEST ENDPOINTS ====================
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: "Server running on Railway!",
        cpp_available: !!CPP_EXE,
        cpp_path: CPP_EXE,
        platform: process.platform
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════════');
    console.log('🚀 TASKPULSE DEPLOYED ON RAILWAY!');
    console.log(`📌 PORT: ${PORT}`);
    console.log(`📌 Platform: ${process.platform}`);
    console.log(`📌 C++ Executable: ${CPP_EXE || '⚠️ NOT FOUND'}`);
    console.log(`📌 Supabase: ✅ Configured`);
    console.log('═══════════════════════════════════════════════\n');
});