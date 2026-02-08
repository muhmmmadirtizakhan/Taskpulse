// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const actionCards = document.querySelectorAll('.action-card');
const pageTitle = document.getElementById('pageTitle');
const pageDesc = document.getElementById('pageDesc');
const currentTime = document.getElementById('currentTime');
const themeSwitch = document.getElementById('themeSwitch');
const logoutBtn = document.querySelector('.logout-btn');

// Backend API URL
const API_BASE = 'http://localhost:3000/api';

// Activity Data
let activities = [];
let undoStack = [];
let redoStack = [];
let lastDeletedActivity = null;

// ===================== ID UPDATE HELPER =====================
function updateActivityIdEverywhere(oldId, newId) {
    // 1. Update in activities array
    const activityIndex = activities.findIndex(a => a.id === oldId);
    if (activityIndex !== -1) {
        activities[activityIndex].id = newId;
    }
    
    // 2. Update in undo stack
    undoStack.forEach(item => {
        if (item.activity && item.activity.id === oldId) {
            item.activity.id = newId;
        }
    });
    
    // 3. Update in redo stack
    redoStack.forEach(item => {
        if (item.activity && item.activity.id === oldId) {
            item.activity.id = newId;
        }
    });
    
    // 4. Update last deleted activity
    if (lastDeletedActivity && lastDeletedActivity.id === oldId) {
        lastDeletedActivity.id = newId;
    }
    
    // Save changes
    saveActivities();
    console.log(`✅ Updated ID everywhere: ${oldId} → ${newId}`);
}

// ===================== FIND ACTIVITY BY ID =====================
function findActivityById(activityId) {
    const searchId = activityId.toString().trim();
    
    // Exact match
    let activity = activities.find(a => a.id.toString() === searchId);
    
    // Partial match
    if (!activity) {
        activity = activities.find(a => 
            a.id.toString().includes(searchId) || 
            a.id.toString().endsWith(searchId)
        );
    }
    
    return activity;
}

// ===================== SYNC WITH DATABASE =====================
async function syncWithDatabase() {
    if (!window.currentUser || !window.currentUser.uid) return;
    
    try {
        const response = await fetch(`${API_BASE}/user-activities?userId=${window.currentUser.uid}`);
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                activities = result.activities;
                
                // Save to localStorage
                const userKey = `taskpulse_${window.currentUser.uid}`;
                localStorage.setItem(userKey, JSON.stringify(activities));
                
                // Update UI
                updateActivitiesTable();
                updateStats();
                updateUndoUIDisplay();
                console.log('✅ Synced with database');
            }
        }
    } catch (error) {
        console.log('⚠️ Sync error:', error);
    }
}

// ===================== LOAD ACTIVITIES =====================
async function loadActivities() {
    if (!window.currentUser || !window.currentUser.uid) {
        console.log('⚠️ No user found');
        return [];
    }
    
    const userId = window.currentUser.uid;
    console.log('🔄 Loading activities for:', userId);
    
    try {
        const response = await fetch(`${API_BASE}/user-activities?userId=${userId}`);
        
        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                console.log(`📥 Loaded ${result.activities.length} activities`);
                
                const userKey = `taskpulse_${userId}`;
                localStorage.setItem(userKey, JSON.stringify(result.activities));
                
                return result.activities;
            }
        }
    } catch (error) {
        console.log('⚠️ Load failed, checking localStorage');
    }
    
    const userKey = `taskpulse_${userId}`;
    const userData = localStorage.getItem(userKey);
    
    if (userData) {
        const userActivities = JSON.parse(userData);
        console.log(`📦 Found ${userActivities.length} activities locally`);
        return userActivities;
    }
    
    return [];
}

// ===================== SAVE ACTIVITIES =====================
function saveActivities() {
    if (!window.currentUser || !window.currentUser.uid) return;
    
    const userKey = `taskpulse_${window.currentUser.uid}`;
    localStorage.setItem(userKey, JSON.stringify(activities));
    console.log(`💾 Saved ${activities.length} activities locally`);
}

// ===================== UTILITY FUNCTIONS =====================
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', hour12: true});
    if(currentTime) currentTime.textContent = timeString;
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

function switchCard(cardId, title, description) {
    actionCards.forEach(card => card.classList.remove('active'));
    const selectedCard = document.getElementById(`${cardId}Card`);
    if(selectedCard) selectedCard.classList.add('active');
    if(pageTitle) pageTitle.textContent = title;
    if(pageDesc) pageDesc.textContent = description;
}

function showNotification(message, type = 'success') {
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        background: ${type === 'success' ? '#10B981' : '#EF4444'};
        color: white;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// ===================== UPDATE UNDO UI =====================
function updateUndoUIDisplay() {
    const undoTitle = document.getElementById('undoTitle');
    const undoDesc = document.getElementById('undoDesc');
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    
    if (undoStack.length === 0) {
        if (undoTitle) undoTitle.textContent = 'No actions to undo';
        if (undoDesc) undoDesc.textContent = 'Perform some actions first to enable undo';
        if (permanentDeleteBtn) {
            permanentDeleteBtn.style.display = 'none';
            permanentDeleteBtn.disabled = true;
        }
        lastDeletedActivity = null;
    } else {
        const lastActivity = undoStack[undoStack.length - 1].activity;
        if (undoTitle) undoTitle.textContent = `Last deleted: ${lastActivity.title}`;
        if (undoDesc) undoDesc.textContent = `Click Undo to restore or Delete Permanently to remove from undo history`;
        
        if (permanentDeleteBtn) {
            permanentDeleteBtn.style.display = 'block';
            permanentDeleteBtn.disabled = false;
        }
        
        lastDeletedActivity = lastActivity;
    }
}

// ===================== ADD ACTIVITY =====================
function setupAddActivity() {
    const addBtn = document.getElementById('addBtn');
    if (!addBtn) return;
    
    addBtn.addEventListener('click', async function() {
        const activityData = {
            title: document.getElementById('addTitle').value.trim(),
            description: document.getElementById('addDescription').value.trim(),
            category: document.getElementById('addCategory').value,
            priority: document.getElementById('addPriority').value,
            status: document.getElementById('addStatus').value,
            score: parseInt(document.getElementById('addScore').value) || 0
        };
        
        if (!activityData.title) {
            showNotification('Please enter activity title!', 'error');
            document.getElementById('addTitle').focus();
            return;
        }
        
        if (!window.currentUser || !window.currentUser.uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        const tempId = Date.now().toString();
        const activity = {
            id: tempId,
            ...activityData,
            user_id: window.currentUser.uid,
            firebase_uid: window.currentUser.uid,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        activities.push(activity);
        saveActivities();
        redoStack.length = 0;
        updateActivitiesTable();
        updateStats();
        
        const originalText = addBtn.innerHTML;
        addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        addBtn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/add-activity`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ...activityData,
                    userId: window.currentUser.uid
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('✅ Activity saved!', 'success');
                
                // ✅ CRITICAL FIX: Update ID everywhere
                if (result.data && result.data.id !== tempId) {
                    updateActivityIdEverywhere(tempId, result.data.id);
                }
                
                // Clear form
                document.getElementById('addTitle').value = '';
                document.getElementById('addDescription').value = '';
                document.getElementById('addCategory').value = 'work';
                document.getElementById('addPriority').value = 'medium';
                document.getElementById('addStatus').value = 'incomplete';
                document.getElementById('addScore').value = '0';
                
                // Sync UI
                updateActivitiesTable();
                updateStats();
            } else {
                showNotification('❌ ' + (result.message || 'Failed to save'), 'error');
                // Remove failed activity
                const index = activities.findIndex(a => a.id === tempId);
                if (index !== -1) {
                    activities.splice(index, 1);
                    saveActivities();
                    updateActivitiesTable();
                    updateStats();
                }
            }
        } catch (error) {
            console.error('❌ Server Error:', error);
            showNotification('⚠️ Server error, saved locally only', 'warning');
        }
        
        addBtn.innerHTML = originalText;
        addBtn.disabled = false;
    });
}

// ===================== DELETE ACTIVITY =====================
function setupDeleteActivity() {
    const deleteBtn = document.getElementById('deleteBtn');
    if (!deleteBtn) return;
    
    deleteBtn.addEventListener('click', async function() {
        const activityId = document.getElementById('deleteId').value.trim();
        
        if (!activityId) {
            showNotification('Please enter activity ID!', 'error');
            document.getElementById('deleteId').focus();
            return;
        }
        
        if (!window.currentUser || !window.currentUser.uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        // ✅ FIX: Use find helper
        const activityToDelete = findActivityById(activityId);
        
        if (!activityToDelete) {
            showNotification('Activity not found! Try refreshing page.', 'error');
            return;
        }
        
        const activityIndex = activities.findIndex(a => a.id === activityToDelete.id);
        
        if (!confirm(`Delete activity: "${activityToDelete.title}"?`)) {
            return;
        }
        
        // ✅ FIX: Remove from local FIRST
        activities.splice(activityIndex, 1);
        saveActivities();
        
        // Save to undo stack
        undoStack.push({
            type: 'delete',
            activity: activityToDelete,
            index: activityIndex,
            timestamp: new Date().toISOString()
        });
        
        redoStack.length = 0;
        updateActivitiesTable();
        updateStats();
        updateUndoUIDisplay();
        
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        deleteBtn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/delete-activity`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    activityId: activityToDelete.id,
                    userId: window.currentUser.uid
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('✅ Activity deleted!', 'success');
                document.getElementById('deleteId').value = '';
                
                // ✅ FIX: Sync with database
                setTimeout(() => {
                    syncWithDatabase();
                }, 300);
            } else {
                showNotification('❌ ' + result.message, 'error');
            }
        } catch (error) {
            showNotification('⚠️ Server error, but deleted locally', 'warning');
        }
        
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Activity';
        deleteBtn.disabled = false;
    });
}

// ===================== PERMANENT DELETE =====================
async function permanentDeleteActivity(activity) {
    if (!activity || !activity.id) {
        showNotification('No activity to delete!', 'error');
        return;
    }
    
    if (!window.currentUser || !window.currentUser.uid) {
        showNotification('User not authenticated', 'error');
        return;
    }
    
    if (!confirm(`🔥 PERMANENT DELETE?\n\n"${activity.title}"\n\nThis will remove it from undo history permanently!`)) {
        return;
    }
    
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    if (permanentDeleteBtn) {
        permanentDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        permanentDeleteBtn.disabled = true;
    }
    
    try {
        // ✅ FIX: Remove from undo stack
        undoStack = undoStack.filter(item => item.activity.id !== activity.id);
        
        // ✅ FIX: Remove from redo stack
        redoStack = redoStack.filter(item => item.activity?.id !== activity.id);
        
        // ✅ FIX: Clear lastDeletedActivity if it's this one
        if (lastDeletedActivity && lastDeletedActivity.id === activity.id) {
            lastDeletedActivity = null;
        }
        
        // ✅ FIX: Update UI
        updateUndoUIDisplay();
        updateStats();
        
        // ✅ FIX: Save changes
        saveActivities();
        
        console.log('✅ Permanent delete done (memory only)');
        showNotification('🔥 Activity removed from undo history!', 'success');
        
    } catch (error) {
        console.error('❌ Permanent delete error:', error);
        showNotification('⚠️ Error removing from undo history', 'error');
    } finally {
        if (permanentDeleteBtn) {
            permanentDeleteBtn.innerHTML = '<i class="fas fa-fire"></i> Delete Permanently';
            permanentDeleteBtn.disabled = false;
        }
    }
}

// ===================== SETUP PERMANENT DELETE =====================
function setupPermanentDelete() {
    const permanentDeleteBtn = document.getElementById('permanentDeleteBtn');
    if (!permanentDeleteBtn) return;
    
    permanentDeleteBtn.addEventListener('click', function() {
        if (undoStack.length === 0 || !lastDeletedActivity) {
            showNotification('No activity available for permanent delete!', 'error');
            return;
        }
        
        permanentDeleteActivity(lastDeletedActivity);
    });
}

// ===================== UNDO FUNCTION =====================
function setupUndoFunction() {
    const undoBtn = document.getElementById('undoBtn');
    if (!undoBtn) return;
    
    undoBtn.addEventListener('click', async function() {
        if (undoStack.length === 0) {
            showNotification('Nothing to undo!', 'error');
            return;
        }
        
        const lastAction = undoStack.pop();
        
        if (lastAction.type === 'delete') {
            // Add back to activities
            activities.splice(lastAction.index, 0, lastAction.activity);
            saveActivities();
            
            // Move to redo stack
            redoStack.push(lastAction);
            
            updateActivitiesTable();
            updateStats();
            updateUndoUIDisplay();
            
            undoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Undoing...';
            undoBtn.disabled = true;
            
            try {
                const response = await fetch(`${API_BASE}/undo-delete`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        activity: lastAction.activity,
                        userId: window.currentUser.uid
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('↩️ Activity restored!', 'success');
                } else {
                    showNotification('⚠️ Database undo failed', 'warning');
                }
            } catch (error) {
                console.log('Undo error:', error);
                showNotification('⚠️ Server error', 'warning');
            }
            
            undoBtn.innerHTML = `<i class="fas fa-undo"></i> Undo (${undoStack.length})`;
            undoBtn.disabled = undoStack.length === 0;
        }
    });
}

// ===================== REDO FUNCTION =====================
function setupRedoFunction() {
    const redoBtn = document.getElementById('redoBtn');
    if (!redoBtn) return;
    
    redoBtn.addEventListener('click', async function() {
        if (redoStack.length === 0) {
            showNotification('Nothing to redo!', 'error');
            return;
        }
        
        const lastUndone = redoStack.pop();
        
        if (lastUndone.type === 'delete') {
            // Find activity
            const activityIndex = activities.findIndex(a => a.id === lastUndone.activity.id);
            
            if (activityIndex !== -1) {
                // Remove from activities
                activities.splice(activityIndex, 1);
                saveActivities();
                
                // Move back to undo stack
                undoStack.push(lastUndone);
                
                updateActivitiesTable();
                updateStats();
                updateUndoUIDisplay();
                
                redoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Redoing...';
                redoBtn.disabled = true;
                
                try {
                    const response = await fetch(`${API_BASE}/redo-delete`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            activityId: lastUndone.activity.id,
                            userId: window.currentUser.uid
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        showNotification('↪️ Activity deleted again!', 'success');
                    } else {
                        showNotification('⚠️ Database redo failed', 'warning');
                    }
                } catch (error) {
                    console.log('Redo error:', error);
                    showNotification('⚠️ Server error', 'warning');
                }
                
                redoBtn.innerHTML = `<i class="fas fa-redo"></i> Redo (${redoStack.length})`;
                redoBtn.disabled = redoStack.length === 0;
            } else {
                showNotification('Activity not found!', 'error');
            }
        }
    });
}

// ===================== UPDATE ACTIVITY =====================
function setupUpdateActivity() {
    const findBtn = document.getElementById('findBtn');
    const updateBtn = document.getElementById('updateBtn');
    
    if (!findBtn || !updateBtn) return;
    
    findBtn.addEventListener('click', async function() {
        const activityId = document.getElementById('updateId').value.trim();
        
        if (!activityId) {
            showNotification('Please enter activity ID!', 'error');
            document.getElementById('updateId').focus();
            return;
        }
        
        if (!window.currentUser || !window.currentUser.uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        findBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finding...';
        findBtn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/get-activity?activityId=${activityId}&userId=${window.currentUser.uid}`);
            
            if (response.ok) {
                const result = await response.json();
                
                if (result.success && result.activity) {
                    document.getElementById('updateTitle').value = result.activity.title;
                    document.getElementById('updateDescription').value = result.activity.description || '';
                    document.getElementById('updateCategory').value = result.activity.category;
                    document.getElementById('updatePriority').value = result.activity.priority;
                    document.getElementById('updateStatus').value = result.activity.status;
                    document.getElementById('updateScore').value = result.activity.score.toString();
                    
                    showNotification('✅ Activity found in database!', 'success');
                    
                    const localIndex = activities.findIndex(a => a.id === activityId);
                    if (localIndex !== -1) {
                        activities[localIndex] = result.activity;
                    } else {
                        activities.push(result.activity);
                    }
                    saveActivities();
                } else {
                    const localActivity = activities.find(a => 
                        a.id === activityId || a.id.includes(activityId)
                    );
                    
                    if (localActivity) {
                        document.getElementById('updateTitle').value = localActivity.title;
                        document.getElementById('updateDescription').value = localActivity.description || '';
                        document.getElementById('updateCategory').value = localActivity.category;
                        document.getElementById('updatePriority').value = localActivity.priority;
                        document.getElementById('updateStatus').value = localActivity.status;
                        document.getElementById('updateScore').value = localActivity.score.toString();
                        
                        showNotification('Activity found locally!', 'success');
                    } else {
                        showNotification('Activity not found!', 'error');
                    }
                }
            } else {
                showNotification('Server error while finding activity', 'error');
            }
        } catch (error) {
            console.error('Find activity error:', error);
            showNotification('Connection error, checking locally...', 'warning');
            
            const activity = activities.find(a => a.id === activityId || a.id.includes(activityId));
            
            if (activity) {
                document.getElementById('updateTitle').value = activity.title;
                document.getElementById('updateDescription').value = activity.description || '';
                document.getElementById('updateCategory').value = activity.category;
                document.getElementById('updatePriority').value = activity.priority;
                document.getElementById('updateStatus').value = activity.status;
                document.getElementById('updateScore').value = activity.score.toString();
                
                showNotification('Activity found locally!', 'success');
            } else {
                showNotification('Activity not found!', 'error');
            }
        }
        
        findBtn.innerHTML = '<i class="fas fa-search"></i> Find';
        findBtn.disabled = false;
    });
    
    updateBtn.addEventListener('click', async function() {
        const activityId = document.getElementById('updateId').value.trim();
        const activityData = {
            title: document.getElementById('updateTitle').value.trim(),
            description: document.getElementById('updateDescription').value.trim(),
            category: document.getElementById('updateCategory').value,
            priority: document.getElementById('updatePriority').value,
            status: document.getElementById('updateStatus').value,
            score: parseInt(document.getElementById('updateScore').value) || 0
        };
        
        if (!activityId) {
            showNotification('Please enter activity ID!', 'error');
            document.getElementById('updateId').focus();
            return;
        }
        
        if (!activityData.title) {
            showNotification('Please enter activity title!', 'error');
            document.getElementById('updateTitle').focus();
            return;
        }
        
        if (!window.currentUser || !window.currentUser.uid) {
            showNotification('User not authenticated', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to update this activity?')) {
            return;
        }
        
        const activityIndex = activities.findIndex(a => a.id === activityId || a.id.includes(activityId));
        
        if (activityIndex !== -1) {
            const oldActivity = { ...activities[activityIndex] };
            
            activities[activityIndex] = {
                ...activities[activityIndex],
                ...activityData,
                updated_at: new Date().toISOString()
            };
            
            saveActivities();
            updateActivitiesTable();
            updateStats();
            
            showNotification('Activity updated locally!', 'success');
        } else {
            showNotification('Activity not found locally!', 'error');
            return;
        }
        
        updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        updateBtn.disabled = true;
        
        try {
            const response = await fetch(`${API_BASE}/update-activity`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    activityId: activityId,
                    userId: window.currentUser.uid,
                    ...activityData
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showNotification('✅ Activity updated in database!', 'success');
                
                document.getElementById('updateId').value = '';
                document.getElementById('updateTitle').value = '';
                document.getElementById('updateDescription').value = '';
                document.getElementById('updateCategory').value = 'work';
                document.getElementById('updatePriority').value = 'medium';
                document.getElementById('updateStatus').value = 'incomplete';
                document.getElementById('updateScore').value = '0';
                
                redoStack.length = 0;
            } else {
                showNotification('❌ ' + (result.message || 'Failed to update'), 'error');
            }
        } catch (error) {
            console.error('Update error:', error);
            showNotification('⚠️ Server error, but updated locally', 'warning');
        }
        
        updateBtn.innerHTML = '<i class="fas fa-save"></i> Update Activity';
        updateBtn.disabled = false;
    });
}

// ===================== SEARCH FUNCTION =====================
function setupSearchFunction() {
    const searchBtn = document.getElementById('searchBtn');
    if (!searchBtn) return;
    
    searchBtn.addEventListener('click', function() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
        
        if (!searchTerm) {
            showNotification('Please enter search term!', 'error');
            return;
        }
        
        const results = activities.filter(activity => 
            activity.title.toLowerCase().includes(searchTerm) ||
            activity.description.toLowerCase().includes(searchTerm) ||
            activity.category.toLowerCase().includes(searchTerm)
        );
        
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>No activities found for "${searchTerm}"</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        results.forEach(activity => {
            html += `
                <div class="search-result-item">
                    <div class="result-title">${activity.title}</div>
                    <div class="result-meta">
                        <span>Category: ${activity.category}</span>
                        <span>Priority: ${activity.priority}</span>
                        <span>Score: ${activity.score}</span>
                    </div>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = html;
    });
}

// ===================== ACTIVITIES TABLE =====================
function updateActivitiesTable() {
    const tableBody = document.getElementById('activitiesTable');
    if (!tableBody) return;
    
    if (activities.length === 0) {
        tableBody.innerHTML = `
            <div class="empty-activities">
                <div class="empty-icon">
                    <i class="fas fa-tasks"></i>
                </div>
                <h4>No Activities Yet</h4>
                <p>Your activities will appear here once you start adding them</p>
                <button class="btn outline" id="startAddingBtn">
                    <i class="fas fa-plus"></i>
                    Start Adding Activities
                </button>
            </div>
        `;
        
        const startBtn = document.getElementById('startAddingBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                switchCard('add', 'Add New Activity', 'Add new activities with category, priority, status and score');
                navItems.forEach(item => item.classList.remove('active'));
                document.querySelector('[data-section="add"]').classList.add('active');
            });
        }
        return;
    }
    
    let html = '';
    activities.forEach((activity, index) => {
        const categoryClass = `category-${activity.category}`;
        const priorityClass = `priority-${activity.priority}`;
        const statusClass = `status-${activity.status}`;
        const scoreClass = `score-${activity.score}`;
        
        const createdDate = activity.created_at ? 
            new Date(activity.created_at).toLocaleDateString() : 'N/A';
        
        html += `
            <div class="table-row">
                <div class="table-col" data-label="ID">
                    <span class="activity-id">#${activity.id.slice(-6)}</span>
                </div>
                <div class="table-col" data-label="Activity">
                    <div class="activity-details">
                        <div class="activity-title">
                            ${activity.title}
                        </div>
                        <div class="activity-desc">
                            ${activity.description || 'No description'}
                        </div>
                        <div class="activity-date">
                            <small>Created: ${createdDate}</small>
                        </div>
                    </div>
                </div>
                <div class="table-col" data-label="Category">
                    <span class="category-badge ${categoryClass}">
                        ${activity.category}
                    </span>
                </div>
                <div class="table-col" data-label="Priority">
                    <span class="priority-badge ${priorityClass}">
                        ${activity.priority}
                    </span>
                </div>
                <div class="table-col" data-label="Status">
                    <span class="status-badge ${statusClass}">
                        ${activity.status}
                    </span>
                </div>
                <div class="table-col" data-label="Score">
                    <span class="score-badge ${scoreClass}">
                        ${activity.score} pts
                    </span>
                </div>
            </div>
        `;
    });
    
    tableBody.innerHTML = html;
}

// ===================== STATS UPDATE =====================
function updateStats() {
    const totalElement = document.getElementById('totalActivities');
    const completedElement = document.getElementById('completedActivities');
    const scoreElement = document.getElementById('totalScore');
    
    if (totalElement) totalElement.textContent = activities.length;
    
    const completed = activities.filter(a => a.status === 'complete').length;
    if (completedElement) completedElement.textContent = completed;
    
    const totalScore = activities.reduce((sum, a) => sum + (parseInt(a.score) || 0), 0);
    if (scoreElement) scoreElement.textContent = totalScore;
    
    const undoCount = document.getElementById('undoCount');
    const totalActions = document.getElementById('totalActions');
    const redoCount = document.getElementById('redoCount');
    const redoStackCount = document.getElementById('redoStack');
    
    if (undoCount) undoCount.textContent = undoStack.length;
    if (totalActions) totalActions.textContent = activities.length;
    if (redoCount) redoCount.textContent = redoStack.length;
    if (redoStackCount) redoStackCount.textContent = redoStack.length;
    
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
        undoBtn.innerHTML = undoStack.length === 0 
            ? '<i class="fas fa-undo"></i> Nothing to Undo'
            : `<i class="fas fa-undo"></i> Undo (${undoStack.length})`;
    }
    
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
        redoBtn.innerHTML = redoStack.length === 0
            ? '<i class="fas fa-redo"></i> Nothing to Redo'
            : `<i class="fas fa-redo"></i> Redo (${redoStack.length})`;
    }
}

// ===================== TEST SUPABASE CONNECTION =====================
async function testSupabaseConnection() {
    try {
        const response = await fetch(`${API_BASE}/test-supabase`);
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Supabase connection test: PASSED');
        } else {
            console.warn('⚠️ Supabase connection test: FAILED', result.error);
        }
    } catch (error) {
        console.warn('⚠️ Supabase test failed:', error);
    }
}

// ===================== MOBILE MENU =====================
function setupMobileMenu() {
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');
    const mobileMenu = document.querySelector('.mobile-menu');
    const mobileMenuClose = document.querySelector('.mobile-menu-close');
    const mobileNavItems = document.querySelectorAll('.mobile-nav-menu .nav-item');
    const mobileThemeSwitch = document.querySelector('#mobileThemeSwitch');
    const mainThemeSwitch = document.querySelector('#themeSwitch');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenuOverlay.style.display = 'block';
            setTimeout(() => {
                mobileMenu.classList.add('active');
            }, 10);
        });

        function closeMobileMenu() {
            mobileMenu.classList.remove('active');
            setTimeout(() => {
                mobileMenuOverlay.style.display = 'none';
            }, 300);
        }

        if (mobileMenuClose) {
            mobileMenuClose.addEventListener('click', closeMobileMenu);
        }

        if (mobileMenuOverlay) {
            mobileMenuOverlay.addEventListener('click', closeMobileMenu);
        }

        if (mobileNavItems.length > 0) {
            mobileNavItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const section = item.getAttribute('data-section');
                    
                    const desktopNavItem = document.querySelector(`.nav-menu .nav-item[data-section="${section}"]`);
                    if (desktopNavItem) {
                        desktopNavItem.click();
                    }
                    
                    closeMobileMenu();
                });
            });
        }

        if (mainThemeSwitch && mobileThemeSwitch) {
            mobileThemeSwitch.checked = mainThemeSwitch.checked;
            
            mainThemeSwitch.addEventListener('change', () => {
                mobileThemeSwitch.checked = mainThemeSwitch.checked;
            });
            
            mobileThemeSwitch.addEventListener('change', () => {
                mainThemeSwitch.checked = mobileThemeSwitch.checked;
                mainThemeSwitch.dispatchEvent(new Event('change'));
            });
        }

        function updateMobileUserInfo() {
            if (window.currentUser) {
                const mobileUserName = document.querySelector('.mobile-user-section .user-info h4');
                const mobileUserStatus = document.querySelector('.mobile-user-section .user-info p');
                
                if (mobileUserName) mobileUserName.textContent = window.currentUser.name;
                if (mobileUserStatus) mobileUserStatus.textContent = "Logged In User";
            }
        }

        const userCheckInterval = setInterval(() => {
            if (window.currentUser && window.currentUser.name) {
                updateMobileUserInfo();
                clearInterval(userCheckInterval);
            }
        }, 500);
    }

    function checkMobileMenu() {
        if (mobileMenuBtn) {
            if (window.innerWidth <= 768) {
                mobileMenuBtn.style.display = 'flex';
            } else {
                mobileMenuBtn.style.display = 'none';
            }
        }
    }

    window.addEventListener('resize', checkMobileMenu);
    window.addEventListener('load', checkMobileMenu);
}

// ===================== INITIALIZATION =====================
async function initializeApp() {
    console.log('🚀 TaskPulse Frontend Initialized');
    
    await testSupabaseConnection();
    
    activities = await loadActivities();
    console.log(`📂 Loaded ${activities.length} activities`);
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        if (themeSwitch) themeSwitch.checked = true;
    }
    
    updateTime();
    setInterval(updateTime, 60000);
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const section = item.getAttribute('data-section');
            
            switchCard(section, 
                section.charAt(0).toUpperCase() + section.slice(1) + ' Activity',
                section === 'add' ? 'Add new activities with category, priority, status and score' :
                section === 'search' ? 'Search through your activities' :
                section === 'update' ? 'Update existing activities' :
                section === 'delete' ? 'Permanently delete activities' :
                section === 'undo' ? 'Undo your recent actions' :
                section === 'redo' ? 'Redo previously undone actions' :
                'View all your activities'
            );
        });
    });
    
    if (themeSwitch) {
        themeSwitch.addEventListener('change', toggleTheme);
    }
    
    setupAddActivity();
    setupUpdateActivity();
    setupDeleteActivity();
    setupPermanentDelete();
    setupUndoFunction();
    setupRedoFunction();
    setupSearchFunction();
    setupMobileMenu();
    updateActivitiesTable();
    updateStats();
    updateUndoUIDisplay();
    
    try {
        const response = await fetch(`${API_BASE}/test`);
        const data = await response.json();
        console.log('✅ Server Connection Test:', data);
    } catch (err) {
        console.warn('⚠️  Server not running');
    }
}

// ===================== START APPLICATION =====================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.currentUser && window.currentUser.uid) {
            initializeApp();
        } else {
            console.log('⏳ Waiting for user authentication...');
            const checkInterval = setInterval(() => {
                if (window.currentUser && window.currentUser.uid) {
                    clearInterval(checkInterval);
                    initializeApp();
                }
            }, 1000);
        }
    }, 500);
});

// ===================== LOGOUT HANDLER =====================
if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        if(confirm('Are you sure you want to logout?')) {
            window.location.href = 'landingpage.html';
        }
    });
}

// Make initializeApp available globally
window.initializeApp = initializeApp;
