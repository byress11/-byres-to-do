// ==================== STATE ====================
let todos = JSON.parse(localStorage.getItem('todos')) || [];
let reminders = JSON.parse(localStorage.getItem('reminders')) || [];
let notes = JSON.parse(localStorage.getItem('notes')) || [];
let currentNoteId = null;
let stats = JSON.parse(localStorage.getItem('stats')) || {
    totalTasks: 0,
    completedTasks: 0,
    totalPomodoros: 0,
    totalMinutes: 0
};

let pomodoroState = {
    isRunning: false,
    isPaused: false,
    currentSession: 'work', // work, shortBreak, longBreak
    timeLeft: 25 * 60,
    completedPomodoros: 0,
    totalTime: 0
};

let currentFilter = 'active';
let isDarkTheme = localStorage.getItem('theme') === 'light' ? false : true;
let reminderIntervals = [];
let isAlwaysOnTop = localStorage.getItem('alwaysOnTop') === 'true';
let currentPalette = localStorage.getItem('palette') || 'indigo';
let currentOpacity = parseInt(localStorage.getItem('opacity') || '100');
let currentBlur = parseInt(localStorage.getItem('blur') || '0');
let currentCategory = 'all';
let soundEnabled = localStorage.getItem('soundEnabled') !== 'false';
let animationsEnabled = localStorage.getItem('animationsEnabled') !== 'false';
let draggedElement = null;
// Varsayılan olarak AÇIK (true)
let categoryFiltersVisible = localStorage.getItem('categoryFiltersVisible') === null ? true : localStorage.getItem('categoryFiltersVisible') === 'true';

// ==================== FIREBASE SYNC STATE ====================
let currentUser = null;
let isSyncEnabled = false;
let syncListeners = [];

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebaseAuth();
    initializeTheme();
    initializeTabs();
    initializeTodo();
    initializePomodoro();
    initializeReminders();
    initializeNotes();
    initializeStats();
    initializeWidgetControls();
    initializeSettings();
    requestNotificationPermission();
    checkReminders();
    setInterval(checkReminders, 30000); // Check every 30 seconds

    // Listen for window position save from Electron
    if (window.isElectron && window.electronAPI) {
        window.electronAPI.onSaveWindowPosition((event, position) => {
            localStorage.setItem('windowX', position.x);
            localStorage.setItem('windowY', position.y);
        });
    }
});

// ==================== FIREBASE AUTHENTICATION ====================
function initializeFirebaseAuth() {
    const loginModal = document.getElementById('loginModal');
    const syncIndicator = document.getElementById('syncIndicator');
    const anonymousLoginBtn = document.getElementById('anonymousLoginBtn');
    const emailLoginBtn = document.getElementById('emailLoginBtn');
    const skipLoginBtn = document.getElementById('skipLoginBtn');

    // Check if user is already logged in
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            isSyncEnabled = true;
            loginModal.classList.add('hidden');
            showSyncStatus('Senkronize edildi', 'success');

            // Hide sync status after 2 seconds
            setTimeout(() => hideSyncStatus(), 2000);

            // Start syncing data
            initializeFirebaseSync();

            // Update account UI
            updateAccountUI(user);

            console.log('User logged in:', user.uid);
        } else {
            currentUser = null;
            isSyncEnabled = false;
            // Show login modal only on first load
            if (!localStorage.getItem('skipLogin')) {
                loginModal.classList.remove('hidden');
            }
            // Update account UI for logged out state
            updateAccountUI(null);
        }
    });

    // Enable Enter key for email login
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');

    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            passwordInput.focus();
        }
    });

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            emailLoginBtn.click();
        }
    });

    // Anonymous login
    anonymousLoginBtn.addEventListener('click', async () => {
        try {
            showSyncStatus('Giriş yapılıyor...', 'syncing');
            await auth.signInAnonymously();
            playSound('success');
        } catch (error) {
            console.error('Anonymous login error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            alert('Anonim giriş başarısız: ' + error.message);
            showSyncStatus('Giriş başarısız', 'error');
            setTimeout(() => hideSyncStatus(), 3000);
        }
    });

    // Email login
    emailLoginBtn.addEventListener('click', async () => {
        const email = document.getElementById('emailInput').value.trim();
        const password = document.getElementById('passwordInput').value;

        if (!email || !password) {
            alert('Lütfen e-posta ve şifre girin');
            return;
        }

        if (password.length < 6) {
            alert('Şifre en az 6 karakter olmalıdır');
            return;
        }

        try {
            showSyncStatus('Giriş yapılıyor...', 'syncing');

            // Try to sign in first
            try {
                await auth.signInWithEmailAndPassword(email, password);
                console.log('Login successful');
            } catch (signInError) {
                console.log('Sign in error:', signInError.code, signInError.message);

                // If user doesn't exist, create new account
                if (signInError.code === 'auth/user-not-found') {
                    console.log('Creating new account...');
                    await auth.createUserWithEmailAndPassword(email, password);
                    console.log('Account created successfully');
                } else if (signInError.code === 'auth/invalid-credential') {
                    // Try creating account if credential is invalid
                    console.log('Invalid credential, trying to create account...');
                    await auth.createUserWithEmailAndPassword(email, password);
                    console.log('Account created successfully');
                } else {
                    throw signInError;
                }
            }

            playSound('success');
        } catch (error) {
            console.error('Email login error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);

            let errorMessage = 'Giriş başarısız';

            if (error.code === 'auth/wrong-password') {
                errorMessage = 'Hatalı şifre';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Geçersiz e-posta adresi';
            } else if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'Bu e-posta zaten kullanımda';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Şifre çok zayıf';
            } else if (error.code === 'auth/network-request-failed') {
                errorMessage = 'Ağ bağlantı hatası';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin';
            } else if (error.code === 'auth/invalid-credential') {
                errorMessage = 'Geçersiz giriş bilgileri';
            } else {
                errorMessage = `Giriş hatası: ${error.message}`;
            }

            alert(errorMessage);
            showSyncStatus(errorMessage, 'error');
            setTimeout(() => hideSyncStatus(), 3000);
        }
    });

    // Skip login
    skipLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('hidden');
        localStorage.setItem('skipLogin', 'true');
        showSyncStatus('Yerel modda çalışıyor', 'success');
        setTimeout(() => hideSyncStatus(), 2000);
    });

    // Account panel handlers
    const userAccountBtn = document.getElementById('userAccountBtn');
    const accountPanel = document.getElementById('accountPanel');
    const accountClose = document.getElementById('accountClose');
    const loginAgainBtn = document.getElementById('loginAgainBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    userAccountBtn.addEventListener('click', () => {
        accountPanel.classList.toggle('active');
        // Close settings panel if open
        document.getElementById('settingsPanel').classList.remove('active');
    });

    accountClose.addEventListener('click', () => {
        accountPanel.classList.remove('active');
    });

    // Close account panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!accountPanel.contains(e.target) && !userAccountBtn.contains(e.target)) {
            accountPanel.classList.remove('active');
        }
    });

    // Login again / Change account
    loginAgainBtn.addEventListener('click', async () => {
        // Sign out current user if logged in
        if (currentUser) {
            await auth.signOut();
        }
        // Clear skip login flag
        localStorage.removeItem('skipLogin');
        // Show login modal
        loginModal.classList.remove('hidden');
        accountPanel.classList.remove('active');
    });

    // Logout button
    logoutBtn.addEventListener('click', async () => {
        if (confirm('Çıkış yapmak istediğinizden emin misiniz?')) {
            try {
                await auth.signOut();
                currentUser = null;
                isSyncEnabled = false;
                accountPanel.classList.remove('active');
                showSyncStatus('Çıkış yapıldı', 'success');
                setTimeout(() => hideSyncStatus(), 2000);

                // Clean up sync listeners
                syncListeners.forEach(unsubscribe => unsubscribe());
                syncListeners = [];
            } catch (error) {
                console.error('Logout error:', error);
                showSyncStatus('Çıkış hatası', 'error');
                setTimeout(() => hideSyncStatus(), 3000);
            }
        }
    });
}

// Update Account UI
function updateAccountUI(user) {
    const userAccountBtn = document.getElementById('userAccountBtn');
    const accountEmail = document.getElementById('accountEmail');
    const accountTypeText = document.getElementById('accountTypeText');
    const syncStatusText = document.getElementById('syncStatusText');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
        // Show account button
        userAccountBtn.style.display = 'flex';

        // Update email
        if (user.isAnonymous) {
            accountEmail.textContent = 'Anonim Kullanıcı';
            accountTypeText.textContent = 'Anonim Hesap';
        } else {
            accountEmail.textContent = user.email || 'Kullanıcı';
            accountTypeText.textContent = 'E-posta ile Giriş';
        }

        // Update sync status
        syncStatusText.textContent = 'Senkronize Ediliyor';
        syncStatusText.style.color = 'var(--success-color)';

        // Show logout button
        logoutBtn.style.display = 'flex';
    } else {
        // Hide account button if not logged in
        if (!localStorage.getItem('skipLogin')) {
            userAccountBtn.style.display = 'none';
        } else {
            userAccountBtn.style.display = 'flex';
        }

        // Update UI for local mode
        accountEmail.textContent = 'Yerel Mod';
        accountTypeText.textContent = 'Senkronizasyon Kapalı';
        syncStatusText.textContent = 'Senkronize Değil';
        syncStatusText.style.color = 'var(--text-muted)';

        // Hide logout button
        logoutBtn.style.display = 'none';
    }
}

// ==================== FIREBASE SYNC ====================
function initializeFirebaseSync() {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;

    // Migrate existing localStorage data to Firebase on first login
    migrateLocalDataToFirebase(userId);

    // Setup real-time listeners for todos
    const todosRef = db.collection('users').doc(userId).collection('todos');
    const unsubscribeTodos = todosRef.orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
        const firebaseTodos = [];
        snapshot.forEach((doc) => {
            firebaseTodos.push({ id: doc.id, ...doc.data() });
        });

        // Update local todos
        todos = firebaseTodos;
        localStorage.setItem('todos', JSON.stringify(todos));
        renderTodos();
        updateStats();
    }, (error) => {
        console.error('Todos sync error:', error);
        showSyncStatus('Senkronizasyon hatası', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    });

    syncListeners.push(unsubscribeTodos);

    // Setup real-time listeners for reminders
    const remindersRef = db.collection('users').doc(userId).collection('reminders');
    const unsubscribeReminders = remindersRef.orderBy('time', 'asc').onSnapshot((snapshot) => {
        const firebaseReminders = [];
        snapshot.forEach((doc) => {
            firebaseReminders.push({ id: doc.id, ...doc.data() });
        });

        // Update local reminders
        reminders = firebaseReminders;
        localStorage.setItem('reminders', JSON.stringify(reminders));
        renderReminders();
    }, (error) => {
        console.error('Reminders sync error:', error);
        showSyncStatus('Hatırlatma senkronizasyon hatası', 'error');
        setTimeout(() => hideSyncStatus(), 3000);
    });

    syncListeners.push(unsubscribeReminders);

    // Setup listener for stats
    const statsRef = db.collection('users').doc(userId).collection('settings').doc('stats');
    const unsubscribeStats = statsRef.onSnapshot((doc) => {
        if (doc.exists) {
            stats = doc.data();
            localStorage.setItem('stats', JSON.stringify(stats));
            updateStats();
        }
    }, (error) => {
        console.error('Stats sync error:', error);
    });

    syncListeners.push(unsubscribeStats);

    // Setup listener for notes
    const notesRef = db.collection('users').doc(userId).collection('notes');
    const unsubscribeNotes = notesRef.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
        const firebaseNotes = [];
        snapshot.forEach((doc) => {
            firebaseNotes.push({ id: doc.id, ...doc.data() });
        });

        // Update local notes
        notes = firebaseNotes;
        localStorage.setItem('notes', JSON.stringify(notes));
        renderNotesList();
    }, (error) => {
        console.error('Notes sync error:', error);
    });

    syncListeners.push(unsubscribeNotes);
}

function migrateLocalDataToFirebase(userId) {
    // Check if migration is needed
    if (localStorage.getItem('migratedToFirebase')) return;

    const localTodos = JSON.parse(localStorage.getItem('todos')) || [];
    const localReminders = JSON.parse(localStorage.getItem('reminders')) || [];
    const localNotes = JSON.parse(localStorage.getItem('notes')) || [];
    const localStats = JSON.parse(localStorage.getItem('stats')) || {
        totalTasks: 0,
        completedTasks: 0,
        totalPomodoros: 0,
        totalMinutes: 0
    };

    // Migrate todos
    if (localTodos.length > 0) {
        const batch = db.batch();
        localTodos.forEach((todo) => {
            const docRef = db.collection('users').doc(userId).collection('todos').doc(todo.id);
            batch.set(docRef, todo);
        });
        batch.commit().then(() => {
            console.log('Todos migrated to Firebase');
        });
    }

    // Migrate reminders
    if (localReminders.length > 0) {
        const batch = db.batch();
        localReminders.forEach((reminder) => {
            const docRef = db.collection('users').doc(userId).collection('reminders').doc(reminder.id);
            batch.set(docRef, reminder);
        });
        batch.commit().then(() => {
            console.log('Reminders migrated to Firebase');
        });
    }

    // Migrate notes
    if (localNotes.length > 0) {
        const batch = db.batch();
        localNotes.forEach((note) => {
            const docRef = db.collection('users').doc(userId).collection('notes').doc(note.id);
            batch.set(docRef, note);
        });
        batch.commit().then(() => {
            console.log('Notes migrated to Firebase');
        });
    }

    // Migrate stats
    db.collection('users').doc(userId).collection('settings').doc('stats').set(localStats).then(() => {
        console.log('Stats migrated to Firebase');
    });

    localStorage.setItem('migratedToFirebase', 'true');
}

// Save todo to Firebase
function saveTodoToFirebase(todo) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('todos').doc(todo.id).set(todo)
        .catch((error) => {
            console.error('Error saving todo to Firebase:', error);
            showSyncStatus('Kaydetme hatası', 'error');
            setTimeout(() => hideSyncStatus(), 2000);
        });
}

// Delete todo from Firebase
function deleteTodoFromFirebase(todoId) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('todos').doc(todoId).delete()
        .catch((error) => {
            console.error('Error deleting todo from Firebase:', error);
        });
}

// Save reminder to Firebase
function saveReminderToFirebase(reminder) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('reminders').doc(reminder.id).set(reminder)
        .catch((error) => {
            console.error('Error saving reminder to Firebase:', error);
        });
}

// Delete reminder from Firebase
function deleteReminderFromFirebase(reminderId) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('reminders').doc(reminderId).delete()
        .catch((error) => {
            console.error('Error deleting reminder from Firebase:', error);
        });
}

// Save stats to Firebase
function saveStatsToFirebase() {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('settings').doc('stats').set(stats)
        .catch((error) => {
            console.error('Error saving stats to Firebase:', error);
        });
}

// Sync status helpers
function showSyncStatus(message, type) {
    const syncIndicator = document.getElementById('syncIndicator');
    const syncStatus = document.getElementById('syncStatus');

    syncIndicator.classList.remove('syncing', 'success', 'error');
    syncIndicator.classList.add('show', type);
    syncStatus.textContent = message;
}

function hideSyncStatus() {
    const syncIndicator = document.getElementById('syncIndicator');
    syncIndicator.classList.remove('show');
}

// ==================== THEME ====================
function initializeTheme() {
    if (!isDarkTheme) {
        document.body.classList.add('light-theme');
    }

    const themeBtn = document.getElementById('themeBtn');
    updateThemeIcon();

    themeBtn.addEventListener('click', () => {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('light-theme');
        localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const themeBtn = document.getElementById('themeBtn');
    const icon = themeBtn.querySelector('i');
    if (isDarkTheme) {
        icon.className = 'fas fa-moon';
    } else {
        icon.className = 'fas fa-sun';
    }
}

// ==================== WIDGET CONTROLS ====================
function initializeWidgetControls() {
    const container = document.getElementById('widgetContainer');
    const header = document.querySelector('.widget-header');

    // Drag functionality
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target.classList.contains('control-btn')) return;
        initialX = e.clientX - container.offsetLeft;
        initialY = e.clientY - container.offsetTop;
        isDragging = true;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            container.style.position = 'fixed';
            container.style.left = currentX + 'px';
            container.style.top = currentY + 'px';
        }
    }

    function dragEnd() {
        isDragging = false;
    }

    // Always on top - For Electron, starts as true (widget mode)
    if (window.isElectron) {
        isAlwaysOnTop = true;
        container.classList.add('always-on-top');
        document.getElementById('alwaysOnTopBtn').classList.add('active');
    } else if (isAlwaysOnTop) {
        container.classList.add('always-on-top');
        document.getElementById('alwaysOnTopBtn').classList.add('active');
    }

    document.getElementById('alwaysOnTopBtn').addEventListener('click', () => {
        isAlwaysOnTop = !isAlwaysOnTop;
        container.classList.toggle('always-on-top');
        document.getElementById('alwaysOnTopBtn').classList.toggle('active');
        localStorage.setItem('alwaysOnTop', isAlwaysOnTop);

        // Notify Electron
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.toggleAlwaysOnTop();
        }
    });

    // Minimize
    document.getElementById('minimizeBtn').addEventListener('click', () => {
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.minimizeWindow();
        } else {
            container.classList.toggle('minimized');
        }
    });

    // Close
    document.getElementById('closeBtn').addEventListener('click', () => {
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.closeWindow();
        } else {
            if (confirm('Uygulamayı kapatmak istediğinizden emin misiniz?')) {
                window.close();
            }
        }
    });

    // Resize functionality
    initializeResize(container);

    // Check and apply saved size
    const savedWidth = localStorage.getItem('widgetWidth');
    const savedHeight = localStorage.getItem('widgetHeight');
    if (savedWidth) container.style.width = savedWidth + 'px';
    if (savedHeight) container.style.height = savedHeight + 'px';
    updateWidgetSize();
}

// ==================== RESIZE FUNCTIONALITY ====================
function initializeResize(container) {
    const handles = document.querySelectorAll('.resize-handle');
    let isResizing = false;
    let currentHandle = null;
    let startX, startY, startWidth, startHeight, startLeft, startTop;

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            currentHandle = handle.dataset.direction;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            startLeft = container.offsetLeft;
            startTop = container.offsetTop;

            e.preventDefault();
            e.stopPropagation();
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        const minWidth = 350;
        const minHeight = 400;
        const maxWidth = window.innerWidth;
        const maxHeight = window.innerHeight;

        switch (currentHandle) {
            case 'right':
                const newWidthR = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                container.style.width = newWidthR + 'px';
                break;

            case 'bottom':
                const newHeightB = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
                container.style.height = newHeightB + 'px';
                break;

            case 'left':
                const newWidthL = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                if (newWidthL > minWidth) {
                    container.style.width = newWidthL + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                break;

            case 'top':
                const newHeightT = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                if (newHeightT > minHeight) {
                    container.style.height = newHeightT + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;

            case 'bottom-right':
                const newWidthBR = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                const newHeightBR = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
                container.style.width = newWidthBR + 'px';
                container.style.height = newHeightBR + 'px';
                break;

            case 'bottom-left':
                const newWidthBL = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                const newHeightBL = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
                if (newWidthBL > minWidth) {
                    container.style.width = newWidthBL + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                container.style.height = newHeightBL + 'px';
                break;

            case 'top-right':
                const newWidthTR = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));
                const newHeightTR = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                container.style.width = newWidthTR + 'px';
                if (newHeightTR > minHeight) {
                    container.style.height = newHeightTR + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;

            case 'top-left':
                const newWidthTL = Math.max(minWidth, Math.min(maxWidth, startWidth - deltaX));
                const newHeightTL = Math.max(minHeight, Math.min(maxHeight, startHeight - deltaY));
                if (newWidthTL > minWidth) {
                    container.style.width = newWidthTL + 'px';
                    container.style.left = (startLeft + deltaX) + 'px';
                }
                if (newHeightTL > minHeight) {
                    container.style.height = newHeightTL + 'px';
                    container.style.top = (startTop + deltaY) + 'px';
                }
                break;
        }

        updateWidgetSize();
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            currentHandle = null;

            // Save size to localStorage
            localStorage.setItem('widgetWidth', container.offsetWidth);
            localStorage.setItem('widgetHeight', container.offsetHeight);
        }
    });
}

function updateWidgetSize() {
    const container = document.getElementById('widgetContainer');
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Remove all size classes
    container.classList.remove('size-small', 'size-medium', 'size-large', 'size-xlarge');

    // Apply appropriate size class
    if (width < 400 || height < 500) {
        container.classList.add('size-small');
    } else if (width < 550 || height < 700) {
        container.classList.add('size-medium');
    } else if (width < 700 || height < 900) {
        container.classList.add('size-large');
    } else {
        container.classList.add('size-xlarge');
    }
}

// ==================== TABS ====================
function initializeTabs() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            navBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabName + 'Tab').classList.add('active');
        });
    });
}

// ==================== TODO ====================
let selectedCategory = 'work';
let selectedPriority = 'medium';

function initializeTodo() {
    renderTodos();

    document.getElementById('addTodoBtn').addEventListener('click', addTodo);
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    // Category button selection
    document.querySelectorAll('#categoryButtons .select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#categoryButtons .select-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCategory = btn.dataset.category;
            playSound('move');
        });
    });

    // Priority button selection
    document.querySelectorAll('#priorityButtons .select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#priorityButtons .select-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPriority = btn.dataset.priority;
            playSound('move');
        });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTodos();
        });
    });

    // Category filters
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderTodos();
        });
    });

    // Collapsible section toggle (input + categories)
    const collapsibleSection = document.getElementById('collapsibleSection');
    const categoryToggleBtn = document.getElementById('categoryToggleBtn');
    
    // Apply saved state
    if (!categoryFiltersVisible) {
        collapsibleSection.classList.add('collapsed');
        categoryToggleBtn.classList.remove('active');
        categoryToggleBtn.querySelector('i').classList.remove('fa-chevron-up');
        categoryToggleBtn.querySelector('i').classList.add('fa-chevron-down');
    } else {
        collapsibleSection.classList.remove('collapsed');
        categoryToggleBtn.classList.add('active');
        categoryToggleBtn.querySelector('i').classList.remove('fa-chevron-down');
        categoryToggleBtn.querySelector('i').classList.add('fa-chevron-up');
    }

    categoryToggleBtn.addEventListener('click', () => {
        categoryFiltersVisible = !categoryFiltersVisible;
        collapsibleSection.classList.toggle('collapsed');
        categoryToggleBtn.classList.toggle('active');
        
        // Toggle icon
        const icon = categoryToggleBtn.querySelector('i');
        if (categoryFiltersVisible) {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
        
        localStorage.setItem('categoryFiltersVisible', categoryFiltersVisible);
        playSound('move');
    });

    // Data export/import
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', importData);

    document.getElementById('clearCompleted').addEventListener('click', () => {
        const completedIds = todos.filter(todo => todo.completed).map(t => t.id);
        todos = todos.filter(todo => !todo.completed);
        saveTodos();
        // Delete completed todos from Firebase
        completedIds.forEach(id => deleteTodoFromFirebase(id));
        renderTodos();
        playSound('delete');
    });
}

function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();

    if (!text) return;

    const todo = {
        id: Date.now().toString(),
        text,
        category: selectedCategory,
        priority: selectedPriority,
        completed: false,
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString().split('T')[0]
    };

    todos.unshift(todo);
    stats.totalTasks++;
    saveTodos();
    saveTodoToFirebase(todo); // Sync to Firebase
    saveStats();
    saveStatsToFirebase(); // Sync stats
    renderTodos();
    updateStats();
    playSound('add');

    input.value = '';
}


function toggleTodo(id) {
    // Convert to string for comparison
    id = String(id);
    const todo = todos.find(t => String(t.id) === id);
    if (todo) {
        todo.completed = !todo.completed;
        if (todo.completed) {
            stats.completedTasks++;
            playSound('complete');
            const todoElement = document.querySelector(`[data-id="${id}"]`);
            if (todoElement && animationsEnabled) {
                todoElement.classList.add('task-complete');
            }
        } else {
            stats.completedTasks--;
        }
        saveTodos();
        saveTodoToFirebase(todo); // Sync to Firebase
        saveStats();
        saveStatsToFirebase(); // Sync stats
        renderTodos();
        updateStats();
    }
}

function deleteTodo(id) {
    // Convert to string for comparison
    id = String(id);
    const todo = todos.find(t => String(t.id) === id);
    if (todo && todo.completed) {
        stats.completedTasks--;
    }
    stats.totalTasks--;
    todos = todos.filter(t => String(t.id) !== id);
    saveTodos();
    deleteTodoFromFirebase(id); // Sync to Firebase
    saveStats();
    saveStatsToFirebase(); // Sync stats
    renderTodos();
    updateStats();
    playSound('delete');
}

function editTodo(id) {
    // Convert to string for comparison
    id = String(id);
    const todo = todos.find(t => String(t.id) === id);
    if (!todo) return;

    // Find the todo item element
    const todoItem = document.querySelector(`[data-id="${id}"]`);
    if (!todoItem) return;

    const todoTextDiv = todoItem.querySelector('.todo-text');
    const todoTextContent = todoItem.querySelector('.todo-text-content');
    const originalText = todo.text;

    // Create an input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.className = 'todo-edit-input';
    input.style.cssText = `
        width: 100%;
        padding: 8px;
        border: 2px solid var(--primary-color);
        border-radius: 6px;
        font-size: 14px;
        font-family: inherit;
        background: var(--bg-secondary);
        color: var(--text-primary);
        outline: none;
    `;

    // Function to save the edit
    const saveEdit = () => {
        const newText = input.value.trim();
        if (newText && newText !== originalText) {
            todo.text = newText;
            saveTodos();
            saveTodoToFirebase(todo); // Sync to Firebase
            playSound('success');
        }
        renderTodos();
    };

    // Function to cancel the edit
    const cancelEdit = () => {
        renderTodos();
    };

    // Replace the text with the input field
    todoTextContent.replaceWith(input);
    input.focus();
    input.select();

    // Disable dragging while editing
    todoItem.draggable = false;

    // Save on Enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        }
    });

    // Save on Escape key - cancel
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cancelEdit();
        }
    });

    // Save when clicking outside (blur)
    input.addEventListener('blur', () => {
        // Small timeout to allow other events to fire first
        setTimeout(saveEdit, 100);
    });
}

function renderTodos() {
    const list = document.getElementById('todoList');
    let filtered = todos.filter(todo => {
        if (currentFilter === 'active') return !todo.completed;
        if (currentFilter === 'completed') return todo.completed;
        return true;
    });

    if (currentCategory !== 'all') {
        filtered = filtered.filter(todo => todo.category === currentCategory);
    }

    const categoryIcons = {
        'personal': '🏠',
        'work': '💼',
        'office': '🏢',
        'other': '📌'
    };

    list.innerHTML = filtered.map((todo, index) => `
        <div class="todo-item ${todo.priority} ${todo.completed ? 'completed' : ''}"
             draggable="true"
             data-id="${todo.id}"
             ondragstart="handleDragStart(event, '${todo.id}')"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event, '${todo.id}')"
             ondragend="handleDragEnd(event)"
             ontouchstart="handleTouchStart(event, '${todo.id}')"
             ontouchmove="handleTouchMove(event)"
             ontouchend="handleTouchEnd(event)">
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}
                   onclick="toggleTodo('${todo.id}')">
            <div class="todo-reorder-btns">
                <button class="reorder-btn" onclick="moveTodoUp('${todo.id}')" ${index === 0 ? 'disabled' : ''} title="Yukarı taşı">
                    <i class="fas fa-chevron-up"></i>
                </button>
                <button class="reorder-btn" onclick="moveTodoDown('${todo.id}')" ${index === filtered.length - 1 ? 'disabled' : ''} title="Aşağı taşı">
                    <i class="fas fa-chevron-down"></i>
                </button>
            </div>
            <div class="todo-text" ondblclick="editTodo('${todo.id}')">
                <span class="todo-text-content">${todo.text}</span>
                <span class="todo-category">${categoryIcons[todo.category] || ''} ${todo.category}</span>
            </div>
            <button class="todo-delete" onclick="deleteTodo('${todo.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    document.getElementById('todoCount').innerHTML =
        `<i class="fas fa-tasks"></i> ${todos.filter(t => !t.completed).length} aktif görev`;
}

// Drag and Drop functions
function handleDragStart(e, id) {
    draggedElement = String(id);
    e.target.classList.add('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.target.closest('.todo-item')?.classList.add('drag-over');
}

function handleDrop(e, targetId) {
    e.preventDefault();
    e.target.closest('.todo-item')?.classList.remove('drag-over');

    targetId = String(targetId);
    if (draggedElement !== targetId) {
        const draggedIndex = todos.findIndex(t => String(t.id) === draggedElement);
        const targetIndex = todos.findIndex(t => String(t.id) === targetId);

        const [draggedTodo] = todos.splice(draggedIndex, 1);
        todos.splice(targetIndex, 0, draggedTodo);

        saveTodos();
        // Sync entire todo list order to Firebase
        if (isSyncEnabled && currentUser) {
            todos.forEach(todo => saveTodoToFirebase(todo));
        }
        renderTodos();
        playSound('move');
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.todo-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedElement = null;
}

// Move todo up in the list
function moveTodoUp(id) {
    id = String(id);
    const index = todos.findIndex(t => String(t.id) === id);
    if (index > 0) {
        // Swap with previous item
        [todos[index - 1], todos[index]] = [todos[index], todos[index - 1]];
        saveTodos();
        // Sync to Firebase
        if (isSyncEnabled && currentUser) {
            todos.forEach(todo => saveTodoToFirebase(todo));
        }
        renderTodos();
        playSound('move');
    }
}

// Move todo down in the list
function moveTodoDown(id) {
    id = String(id);
    const index = todos.findIndex(t => String(t.id) === id);
    if (index >= 0 && index < todos.length - 1) {
        // Swap with next item
        [todos[index], todos[index + 1]] = [todos[index + 1], todos[index]];
        saveTodos();
        // Sync to Firebase
        if (isSyncEnabled && currentUser) {
            todos.forEach(todo => saveTodoToFirebase(todo));
        }
        renderTodos();
        playSound('move');
    }
}

// Touch support for mobile drag and drop
let touchStartY = 0;
let touchStartElement = null;
let touchStartId = null;

function handleTouchStart(e, id) {
    // Don't interfere with button touches
    if (e.target.closest('button') || e.target.closest('input')) {
        return;
    }
    
    touchStartId = String(id);
    touchStartElement = e.currentTarget;
    touchStartY = e.touches[0].clientY;
    touchStartElement.style.opacity = '0.7';
    touchStartElement.style.transform = 'scale(1.02)';
}

function handleTouchMove(e) {
    if (!touchStartElement || !touchStartId) return;
    
    // Don't interfere with button touches
    if (e.target.closest('button') || e.target.closest('input')) {
        return;
    }
    
    e.preventDefault();
    
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - touchStartY;
    
    // Visual feedback
    touchStartElement.style.transform = `translateY(${deltaY}px) scale(1.02)`;
    
    // Find which element we're over
    const elementBelow = document.elementFromPoint(
        e.touches[0].clientX,
        touchY
    );
    
    const todoBelow = elementBelow?.closest('.todo-item');
    
    // Remove all drag-over classes
    document.querySelectorAll('.todo-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    
    // Add drag-over class to target
    if (todoBelow && todoBelow !== touchStartElement) {
        todoBelow.classList.add('drag-over');
    }
}

function handleTouchEnd(e) {
    if (!touchStartElement || !touchStartId) return;
    
    // Reset visual state
    touchStartElement.style.opacity = '';
    touchStartElement.style.transform = '';
    
    const touchEndY = e.changedTouches[0].clientY;
    
    // Find which element we ended on
    const elementBelow = document.elementFromPoint(
        e.changedTouches[0].clientX,
        touchEndY
    );
    
    const todoBelow = elementBelow?.closest('.todo-item');
    
    if (todoBelow && todoBelow !== touchStartElement) {
        const targetId = String(todoBelow.dataset.id);
        
        // Perform the swap
        const draggedIndex = todos.findIndex(t => String(t.id) === touchStartId);
        const targetIndex = todos.findIndex(t => String(t.id) === targetId);
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedTodo] = todos.splice(draggedIndex, 1);
            todos.splice(targetIndex, 0, draggedTodo);
            
            saveTodos();
            // Sync to Firebase
            if (isSyncEnabled && currentUser) {
                todos.forEach(todo => saveTodoToFirebase(todo));
            }
            renderTodos();
            playSound('move');
        }
    }
    
    // Clean up
    document.querySelectorAll('.todo-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    
    touchStartElement = null;
    touchStartId = null;
    touchStartY = 0;
}


// Export Data
function exportData() {
    const data = {
        todos,
        reminders,
        notes,
        stats,
        settings: {
            theme: isDarkTheme ? 'dark' : 'light',
            palette: currentPalette,
            opacity: currentOpacity,
            blur: currentBlur
        },
        exportDate: new Date().toISOString()
    };

    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taskmaster-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    playSound('success');
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);

            if (confirm('Mevcut veriler silinecek. Devam etmek istiyor musunuz?')) {
                if (data.todos) todos = data.todos;
                if (data.reminders) reminders = data.reminders;
                if (data.notes) notes = data.notes;
                if (data.stats) stats = data.stats;

                if (data.settings) {
                    isDarkTheme = data.settings.theme === 'dark';
                    currentPalette = data.settings.palette || 'indigo';
                    currentOpacity = data.settings.opacity || 100;
                    currentBlur = data.settings.blur || 0;
                }

                saveTodos();
                saveReminders();
                saveNotes();
                saveStats();

                renderTodos();
                renderNotesList();
                updateStats();
                location.reload();
                playSound('success');
            }
        } catch (error) {
            alert('Dosya okunamadı. Lütfen geçerli bir yedekleme dosyası seçin.');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

// ==================== POMODORO ====================
function initializePomodoro() {
    const workDuration = parseInt(localStorage.getItem('workDuration') || '25');
    const shortBreak = parseInt(localStorage.getItem('shortBreak') || '5');
    const longBreak = parseInt(localStorage.getItem('longBreak') || '15');

    document.getElementById('workDuration').value = workDuration;
    document.getElementById('shortBreak').value = shortBreak;
    document.getElementById('longBreak').value = longBreak;

    pomodoroState.timeLeft = workDuration * 60;
    updateTimerDisplay();

    document.getElementById('startPomodoroBtn').addEventListener('click', startPomodoro);
    document.getElementById('pausePomodoroBtn').addEventListener('click', pausePomodoro);
    document.getElementById('resetPomodoroBtn').addEventListener('click', resetPomodoro);

    // Save settings on change
    ['workDuration', 'shortBreak', 'longBreak'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            localStorage.setItem(id, e.target.value);
            if (!pomodoroState.isRunning) {
                resetPomodoro();
            }
        });
    });

    updatePomodoroInfo();
}

let pomodoroTimer;

function startPomodoro() {
    if (pomodoroState.isPaused) {
        pomodoroState.isPaused = false;
    } else {
        pomodoroState.isRunning = true;
    }

    document.getElementById('startPomodoroBtn').style.display = 'none';
    document.getElementById('pausePomodoroBtn').style.display = 'inline-block';

    pomodoroTimer = setInterval(() => {
        pomodoroState.timeLeft--;
        pomodoroState.totalTime++;
        updateTimerDisplay();

        if (pomodoroState.timeLeft <= 0) {
            clearInterval(pomodoroTimer);
            completeSession();
        }
    }, 1000);
}

function pausePomodoro() {
    clearInterval(pomodoroTimer);
    pomodoroState.isPaused = true;
    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';
}

function resetPomodoro() {
    clearInterval(pomodoroTimer);
    pomodoroState.isRunning = false;
    pomodoroState.isPaused = false;
    pomodoroState.currentSession = 'work';

    const workDuration = parseInt(document.getElementById('workDuration').value);
    pomodoroState.timeLeft = workDuration * 60;

    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';

    updateTimerDisplay();
}

function completeSession() {
    playNotificationSound();

    if (pomodoroState.currentSession === 'work') {
        pomodoroState.completedPomodoros++;
        stats.totalPomodoros++;
        stats.totalMinutes += parseInt(document.getElementById('workDuration').value);
        saveStats();
        updateStats();
        updatePomodoroInfo();

        showNotification('Pomodoro Tamamlandı!', 'Harika iş çıkardınız! Mola zamanı.');

        // Determine next session
        if (pomodoroState.completedPomodoros % 4 === 0) {
            pomodoroState.currentSession = 'longBreak';
            pomodoroState.timeLeft = parseInt(document.getElementById('longBreak').value) * 60;
        } else {
            pomodoroState.currentSession = 'shortBreak';
            pomodoroState.timeLeft = parseInt(document.getElementById('shortBreak').value) * 60;
        }
    } else {
        showNotification('Mola Bitti!', 'Çalışmaya geri dönme zamanı.');
        pomodoroState.currentSession = 'work';
        pomodoroState.timeLeft = parseInt(document.getElementById('workDuration').value) * 60;
    }

    pomodoroState.isRunning = false;
    document.getElementById('startPomodoroBtn').style.display = 'inline-block';
    document.getElementById('pausePomodoroBtn').style.display = 'none';
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const minutes = Math.floor(pomodoroState.timeLeft / 60);
    const seconds = pomodoroState.timeLeft % 60;

    document.getElementById('timerTime').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const sessionText = {
        'work': 'Çalışma Zamanı',
        'shortBreak': 'Kısa Mola',
        'longBreak': 'Uzun Mola'
    };

    document.getElementById('timerSession').textContent = sessionText[pomodoroState.currentSession];

    // Update progress circle
    const totalTime = pomodoroState.currentSession === 'work'
        ? parseInt(document.getElementById('workDuration').value) * 60
        : pomodoroState.currentSession === 'shortBreak'
        ? parseInt(document.getElementById('shortBreak').value) * 60
        : parseInt(document.getElementById('longBreak').value) * 60;

    const progress = (totalTime - pomodoroState.timeLeft) / totalTime;
    const circumference = 2 * Math.PI * 90;
    const offset = circumference * (1 - progress);

    document.getElementById('timerProgress').style.strokeDashoffset = offset;
}

function updatePomodoroInfo() {
    document.getElementById('completedPomodoros').textContent = pomodoroState.completedPomodoros;
    document.getElementById('totalTime').textContent = Math.floor(pomodoroState.totalTime / 60) + ' dk';
}

// ==================== REMINDERS ====================
function initializeReminders() {
    renderReminders();

    document.getElementById('addReminderBtn').addEventListener('click', addReminder);

    document.getElementById('reminderRepeat').addEventListener('change', (e) => {
        document.getElementById('reminderRepeatInterval').disabled = !e.target.checked;
    });
}

function addReminder() {
    const input = document.getElementById('reminderInput');
    const timeInput = document.getElementById('reminderTime');
    const repeat = document.getElementById('reminderRepeat').checked;
    const interval = document.getElementById('reminderRepeatInterval').value;

    const text = input.value.trim();
    const time = timeInput.value;

    if (!text || !time) {
        alert('Lütfen hatırlatma metni ve zamanı girin!');
        return;
    }

    const reminder = {
        id: Date.now().toString(),
        text,
        time: new Date(time).toISOString(),
        repeat,
        interval: repeat ? interval : null,
        active: true
    };

    reminders.unshift(reminder);
    saveReminders();
    saveReminderToFirebase(reminder); // Sync to Firebase
    renderReminders();

    input.value = '';
    timeInput.value = '';
    document.getElementById('reminderRepeat').checked = false;
    document.getElementById('reminderRepeatInterval').disabled = true;
}

function deleteReminder(id) {
    // Convert to string for comparison
    id = String(id);
    reminders = reminders.filter(r => String(r.id) !== id);
    saveReminders();
    deleteReminderFromFirebase(id); // Sync to Firebase
    renderReminders();
}

function renderReminders() {
    const list = document.getElementById('reminderList');

    if (reminders.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">Henüz hatırlatma yok</p>';
        return;
    }

    list.innerHTML = reminders.map(reminder => {
        const date = new Date(reminder.time);
        const formattedDate = date.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="reminder-item">
                <div class="reminder-header">
                    <span class="reminder-title">${reminder.text}</span>
                    <button class="reminder-delete" onclick="deleteReminder('${reminder.id}')">×</button>
                </div>
                <div class="reminder-time-display">
                    ${formattedDate}
                    ${reminder.repeat ? `<span class="reminder-repeat">${getRepeatText(reminder.interval)}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getRepeatText(interval) {
    const texts = {
        'daily': 'Günlük',
        'weekly': 'Haftalık',
        'monthly': 'Aylık'
    };
    return texts[interval] || '';
}

function saveReminders() {
    localStorage.setItem('reminders', JSON.stringify(reminders));
}

function checkReminders() {
    const now = new Date();

    reminders.forEach(reminder => {
        if (!reminder.active) return;

        const reminderTime = new Date(reminder.time);

        if (now >= reminderTime) {
            showNotification('Hatırlatma!', reminder.text);
            playNotificationSound();

            if (reminder.repeat) {
                // Schedule next reminder
                const next = new Date(reminderTime);
                switch (reminder.interval) {
                    case 'daily':
                        next.setDate(next.getDate() + 1);
                        break;
                    case 'weekly':
                        next.setDate(next.getDate() + 7);
                        break;
                    case 'monthly':
                        next.setMonth(next.getMonth() + 1);
                        break;
                }
                reminder.time = next.toISOString();
            } else {
                reminder.active = false;
            }

            saveReminders();
            if (isSyncEnabled && currentUser) {
                saveReminderToFirebase(reminder);
            }
        }
    });
}

// ==================== NOTES ====================
function initializeNotes() {
    renderNotesList();

    // Add note button
    document.getElementById('addNoteBtn').addEventListener('click', addNote);

    // Enter key on title input
    document.getElementById('noteTitleInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addNote();
    });

    // Auto-save on textarea change
    const noteTextarea = document.getElementById('noteTextarea');
    const currentNoteTitle = document.getElementById('currentNoteTitle');

    noteTextarea.addEventListener('input', () => {
        updateCharCount();
        autoSaveNote();
    });

    currentNoteTitle.addEventListener('input', () => {
        autoSaveNote();
    });

    // Save button
    document.getElementById('saveNoteBtn').addEventListener('click', () => {
        saveCurrentNote();
        playSound('success');
    });

    // Delete button
    document.getElementById('deleteNoteBtn').addEventListener('click', () => {
        if (confirm('Bu notu silmek istediğinizden emin misiniz?')) {
            deleteNote(currentNoteId);
        }
    });
}

function addNote() {
    const titleInput = document.getElementById('noteTitleInput');
    const title = titleInput.value.trim() || 'Başlıksız Not';

    const note = {
        id: Date.now().toString(),
        title: title,
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    notes.unshift(note);
    saveNotes();
    saveNoteToFirebase(note);
    renderNotesList();
    openNote(note.id);
    titleInput.value = '';
    playSound('add');
}

function openNote(id) {
    id = String(id);
    currentNoteId = id;
    const note = notes.find(n => String(n.id) === id);

    if (!note) return;

    // Show editor, hide placeholder
    document.querySelector('.editor-placeholder').style.display = 'none';
    document.getElementById('editorContent').style.display = 'flex';

    // Load note content
    document.getElementById('currentNoteTitle').value = note.title;
    document.getElementById('noteTextarea').value = note.content || '';

    // Update date
    const date = new Date(note.updatedAt);
    document.getElementById('noteDate').textContent = date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Update char count
    updateCharCount();

    // Update active state in list
    document.querySelectorAll('.note-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-note-id="${id}"]`)?.classList.add('active');
}

function saveCurrentNote() {
    if (!currentNoteId) return;

    const note = notes.find(n => String(n.id) === String(currentNoteId));
    if (!note) return;

    note.title = document.getElementById('currentNoteTitle').value.trim() || 'Başlıksız Not';
    note.content = document.getElementById('noteTextarea').value;
    note.updatedAt = new Date().toISOString();

    saveNotes();
    saveNoteToFirebase(note);
    renderNotesList();

    // Update date display
    const date = new Date(note.updatedAt);
    document.getElementById('noteDate').textContent = date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

let autoSaveTimeout;
function autoSaveNote() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveCurrentNote();
    }, 1000); // Auto-save after 1 second of inactivity
}

function deleteNote(id) {
    id = String(id);
    notes = notes.filter(n => String(n.id) !== id);
    saveNotes();
    deleteNoteFromFirebase(id);

    // Hide editor
    document.querySelector('.editor-placeholder').style.display = 'flex';
    document.getElementById('editorContent').style.display = 'none';
    currentNoteId = null;

    renderNotesList();
    playSound('delete');
}

function renderNotesList() {
    const list = document.getElementById('notesList');

    if (notes.length === 0) {
        list.innerHTML = `
            <div class="no-notes-message">
                <i class="fas fa-sticky-note"></i>
                <p>Henüz not eklenmemiş</p>
                <small>Yeni bir not oluşturmak için yukarıdaki butonu kullanın</small>
            </div>
        `;
        return;
    }

    list.innerHTML = notes.map(note => {
        const preview = note.content ? note.content.substring(0, 50) : 'Boş not...';
        const date = new Date(note.updatedAt);
        const formattedDate = date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit'
        });

        return `
            <div class="note-item ${String(note.id) === String(currentNoteId) ? 'active' : ''}"
                 data-note-id="${note.id}"
                 onclick="openNote('${note.id}')">
                <div class="note-item-title">${note.title}</div>
                <div class="note-item-preview">${preview}</div>
                <div class="note-item-date">${formattedDate}</div>
            </div>
        `;
    }).join('');
}

function updateCharCount() {
    const content = document.getElementById('noteTextarea').value;
    const charCount = content.length;
    document.getElementById('noteChars').textContent = `${charCount} karakter`;
}

function saveNotes() {
    localStorage.setItem('notes', JSON.stringify(notes));
}

// Firebase sync for notes
function saveNoteToFirebase(note) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('notes').doc(note.id).set(note)
        .catch((error) => {
            console.error('Error saving note to Firebase:', error);
        });
}

function deleteNoteFromFirebase(noteId) {
    if (!currentUser || !isSyncEnabled) return;

    const userId = currentUser.uid;
    db.collection('users').doc(userId).collection('notes').doc(noteId).delete()
        .catch((error) => {
            console.error('Error deleting note from Firebase:', error);
        });
}

// ==================== STATS ====================
function initializeStats() {
    updateStats();

    document.getElementById('resetStatsBtn').addEventListener('click', () => {
        if (confirm('Tüm istatistikleri sıfırlamak istediğinizden emin misiniz?')) {
            stats = {
                totalTasks: todos.length,
                completedTasks: todos.filter(t => t.completed).length,
                totalPomodoros: 0,
                totalMinutes: 0
            };
            pomodoroState.completedPomodoros = 0;
            pomodoroState.totalTime = 0;
            saveStats();
            updateStats();
            updatePomodoroInfo();
        }
    });
}

function updateStats() {
    document.getElementById('totalTasks').textContent = stats.totalTasks;
    document.getElementById('completedTasks').textContent = stats.completedTasks;
    document.getElementById('totalPomodoros').textContent = stats.totalPomodoros;
    document.getElementById('totalMinutes').textContent = stats.totalMinutes;

    const productivity = stats.totalTasks > 0
        ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
        : 0;

    document.getElementById('productivityPercent').textContent = productivity + '%';
    document.getElementById('productivityProgress').style.width = productivity + '%';
}

function saveStats() {
    localStorage.setItem('stats', JSON.stringify(stats));
}

// ==================== SETTINGS ====================
function initializeSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsClose = document.getElementById('settingsClose');
    const opacitySlider = document.getElementById('opacitySlider');
    const opacityValue = document.getElementById('opacityValue');
    const blurSlider = document.getElementById('blurSlider');
    const blurValue = document.getElementById('blurValue');
    const container = document.getElementById('widgetContainer');

    // Apply saved settings
    document.body.setAttribute('data-palette', currentPalette);
    container.style.opacity = currentOpacity / 100;
    container.style.backdropFilter = `blur(${currentBlur}px)`;
    opacitySlider.value = currentOpacity;
    opacityValue.textContent = currentOpacity + '%';
    blurSlider.value = currentBlur;
    blurValue.textContent = currentBlur + 'px';

    // Set active palette button
    document.querySelectorAll('.palette-btn').forEach(btn => {
        if (btn.dataset.palette === currentPalette) {
            btn.classList.add('active');
        }
    });

    // Toggle settings panel
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('active');
    });

    settingsClose.addEventListener('click', () => {
        settingsPanel.classList.remove('active');
    });

    // Close settings when clicking outside
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            settingsPanel.classList.remove('active');
        }
    });

    // Opacity control
    opacitySlider.addEventListener('input', (e) => {
        currentOpacity = parseInt(e.target.value);
        container.style.opacity = currentOpacity / 100;
        opacityValue.textContent = currentOpacity + '%';
        localStorage.setItem('opacity', currentOpacity);
        
        // Notify Electron for window-level opacity
        if (window.isElectron && window.electronAPI) {
            window.electronAPI.setOpacity(currentOpacity);
        }
    });

    // Blur control
    blurSlider.addEventListener('input', (e) => {
        currentBlur = parseInt(e.target.value);
        container.style.backdropFilter = `blur(${currentBlur}px)`;
        blurValue.textContent = currentBlur + 'px';
        localStorage.setItem('blur', currentBlur);
    });

    // Color palette selection
    document.querySelectorAll('.palette-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPalette = btn.dataset.palette;
            document.body.setAttribute('data-palette', currentPalette);
            localStorage.setItem('palette', currentPalette);
        });
    });

    // Sound effects toggle
    const soundToggle = document.getElementById('soundEffects');
    soundToggle.checked = soundEnabled;
    soundToggle.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('soundEnabled', soundEnabled);
    });

    // Animations toggle
    const animToggle = document.getElementById('animations');
    animToggle.checked = animationsEnabled;
    animToggle.addEventListener('change', (e) => {
        animationsEnabled = e.target.checked;
        localStorage.setItem('animationsEnabled', animationsEnabled);
        if (!animationsEnabled) {
            document.body.classList.add('no-animations');
        } else {
            document.body.classList.remove('no-animations');
        }
    });

    // Apply animations setting
    if (!animationsEnabled) {
        document.body.classList.add('no-animations');
    }
}

// ==================== SOUND EFFECTS ====================
function playSound(type) {
    if (!soundEnabled) return;

    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Different sounds for different actions
        const sounds = {
            'add': { freq: 800, duration: 0.1 },
            'complete': { freq: 1000, duration: 0.15 },
            'delete': { freq: 400, duration: 0.1 },
            'move': { freq: 600, duration: 0.08 },
            'success': { freq: 1200, duration: 0.2 }
        };

        const sound = sounds[type] || sounds.add;

        oscillator.frequency.value = sound.freq;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + sound.duration);

        // Clean up
        setTimeout(() => {
            audioContext.close();
        }, (sound.duration * 1000) + 100);
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

// ==================== NOTIFICATIONS ====================
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function showNotification(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body,
            icon: '📋',
            badge: '📋'
        });
    }
}

function playNotificationSound() {
    if (!soundEnabled) return;

    try {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);

        // Clean up
        setTimeout(() => {
            audioContext.close();
        }, 1000);
    } catch (error) {
        console.error('Error playing notification sound:', error);
    }
}
