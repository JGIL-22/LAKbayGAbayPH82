/* ============================================
   LAKbayGAbayPh — Application Logic
   ============================================ */

(function () {
    'use strict';

    /* ---------- Constants ---------- */
    const STORAGE_KEY = 'lakbaygabay_users';
    const SESSION_KEY = 'lakbaygabay_session';
    const THEME_KEY = 'lakbaygabay_theme';
    const TOTAL_PROVINCES = 82;

    /* ---------- Firebase Configuration ---------- */
    // ⚠️ REPLACE these with your actual Firebase config from Firebase Console
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyAaGDKHNzaAQmzzy2huU7wwMc_dcN2njXg",
        authDomain: "lakbaygabayph82.firebaseapp.com",
        projectId: "lakbaygabayph82",
        storageBucket: "lakbaygabayph82.firebasestorage.app",
        messagingSenderId: "48984429678",
        appId: "1:48984429678:web:0b32670df5053b5fe2427f"
    };

    /* ---------- Firebase Initialization ---------- */
    let firebaseApp = null;
    let firebaseAuth = null;
    let firebaseDb = null;
    let firebaseReady = false;

    try {
        if (typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
            firebaseAuth = firebase.auth();
            firebaseDb = firebase.firestore();
            firebaseReady = true;
            console.log('🔥 Firebase initialized');
        } else if (FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
            console.warn('⚠️ Firebase not configured. Using localStorage only. See FIREBASE_CONFIG in app.js.');
        }
    } catch (e) {
        console.warn('Firebase init failed, falling back to localStorage:', e);
    }

    /* ---------- Firestore Cloud Sync Helpers ---------- */
    async function syncToCloud() {
        if (!firebaseReady || !firebaseAuth.currentUser || !currentUser || currentUser.isGuest) return;
        try {
            const uid = firebaseAuth.currentUser.uid;
            const userData = {
                displayName: currentUser.displayName || '',
                alias: currentUser.alias || '',
                travelerType: currentUser.travelerType || '🎒 Turista',
                provinces: currentUser.provinces || {},
                customNotes: currentUser.customNotes || [],
                bucketChecked: currentUser.bucketChecked || [],
                picture: currentUser.picture || null,
                lastSaved: new Date().toISOString()
            };
            await firebaseDb.collection('users').doc(uid).set(userData, { merge: true });
        } catch (e) {
            console.warn('Cloud sync failed:', e);
        }
    }

    async function loadFromCloud() {
        if (!firebaseReady || !firebaseAuth.currentUser) return null;
        try {
            const uid = firebaseAuth.currentUser.uid;
            const doc = await firebaseDb.collection('users').doc(uid).get();
            if (doc.exists) return doc.data();
        } catch (e) {
            console.warn('Cloud load failed:', e);
        }
        return null;
    }

    async function handleGoogleSignIn(overlay) {
        if (!firebaseReady) {
            showToast('Firebase not configured. Please set up your Firebase project.', 'error');
            return;
        }
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            const result = await firebaseAuth.signInWithPopup(provider);
            const gUser = result.user;

            // Load existing data from Firestore
            const cloudData = await loadFromCloud();

            if (cloudData) {
                // Returning user — load from cloud
                currentUser = {
                    key: gUser.uid,
                    displayName: cloudData.displayName || gUser.displayName || 'Explorer',
                    alias: cloudData.alias || gUser.displayName?.split(' ')[0] || 'Traveler',
                    pin: '000000',
                    picture: cloudData.picture || gUser.photoURL || null,
                    travelerType: cloudData.travelerType || '🎒 Turista',
                    provinces: cloudData.provinces || {},
                    customNotes: cloudData.customNotes || [],
                    bucketChecked: cloudData.bucketChecked || [],
                    isFirebase: true
                };
                showToast(`Welcome back, ${currentUser.displayName}!`, 'success');
            } else {
                // New user — create in Firestore
                currentUser = {
                    key: gUser.uid,
                    displayName: gUser.displayName || 'Explorer',
                    alias: gUser.displayName?.split(' ')[0] || 'Traveler',
                    pin: '000000',
                    picture: gUser.photoURL || null,
                    travelerType: '🎒 Turista',
                    provinces: {},
                    customNotes: [],
                    bucketChecked: [],
                    isFirebase: true,
                    createdAt: new Date().toISOString()
                };
                await syncToCloud();
                showToast(`Welcome, ${currentUser.displayName}! Account created with Google.`, 'success');
            }

            // Also cache locally for fast reload
            const users = getAllUsers();
            users[gUser.uid] = { ...currentUser };
            delete users[gUser.uid].key;
            delete users[gUser.uid].isFirebase;
            saveAllUsers(users);
            setSession(gUser.uid);

            overlay.classList.add('hidden');
            setTimeout(() => overlay.style.display = 'none', 500);
            onUserReady();

        } catch (e) {
            if (e.code !== 'auth/popup-closed-by-user') {
                console.error('Google sign-in error:', e);
                showToast('Google sign-in failed. ' + (e.message || ''), 'error');
            }
        }
    }

    const CAROUSEL_IMAGES = [
        "image%20sources/Travel%20destinations%20(Hero-section)/Boracay_White_Beach.png",
        "image%20sources/Travel%20destinations%20(Hero-section)/Coron_Palawan.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/Kalanggaman-Island-Stunning-Beaches-Philippines.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/LakeSebu_South%20Cotabato.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/mayon-volcano-shutterstock-ls.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/MountPulag_Sea%20Of%20Clouds%20-%20Benguet.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/Vigan_IlocosSur.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/batanes_lighthouses.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/magellans_cross.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/sanjuanicobridge.jpg",
        "image%20sources/Travel%20destinations%20(Hero-section)/siargaosurfing.webp",
        "image%20sources/Travel%20destinations%20(Hero-section)/Makati_City_Lights_(Jopet_Sy)_-_Flickr.jpg",
    ];

    /* ---------- City → Province Merge Mapping ---------- */
    const CITY_TO_PROVINCE = {
        'Angeles': 'Pampanga', 'Olongapo': 'Zambales', 'Baguio': 'Benguet',
        'Dagupan': 'Pangasinan', 'Santiago': 'Isabela', 'Lucena': 'Quezon',
        'Naga': 'Camarines Sur', 'Bacolod': 'Negros Occidental',
        'Ormoc': 'Leyte', 'Tacloban': 'Leyte',
        'Puerto Princesa': 'Palawan', 'Zamboanga': 'Zamboanga del Sur',
        'Cotabato': 'Maguindanao', 'Davao': 'Davao del Sur',
        'General Santos': 'South Cotabato', 'Iligan': 'Lanao del Norte',
        'Cagayan de Oro': 'Misamis Oriental', 'Butuan': 'Agusan del Norte',
        'Mandaue': 'Cebu', 'Lapu-Lapu': 'Cebu'
    };
    // Iloilo city → Iloilo province handled by name match
    // Isabela city (Basilan) → handled by checking id
    // Cebu city → Cebu province handled by name match

    const NCR_CITIES = [
        'Manila', 'Quezon City', 'Caloocan', 'Makati', 'Mandaluyong City',
        'Marikina', 'Pasig', 'Taguig', 'Pasay', 'Paranaque', 'Las Pinas',
        'Muntinlupa', 'Navotas', 'Malabon', 'Valenzuela', 'San Juan', 'Pateros'
    ];

    /* ---------- Display Name Mapping ---------- */
    const DISPLAY_NAMES = {
        'Mindoro Occidental': 'Occidental Mindoro',
        'Mindoro Oriental': 'Oriental Mindoro',
        'Compostela Valley': 'Davao de Oro'
    };

    /* ---------- Region Definitions (Project 82) ---------- */
    const REGIONS = {
        'NCR': { provinces: ['Metro Manila'], island: 'Luzon' },
        'CAR': { provinces: ['Abra','Apayao','Benguet','Ifugao','Kalinga','Mountain Province'], island: 'Luzon' },
        'Region I': { provinces: ['Ilocos Norte','Ilocos Sur','La Union','Pangasinan'], island: 'Luzon' },
        'Region II': { provinces: ['Batanes','Cagayan','Isabela','Nueva Vizcaya','Quirino'], island: 'Luzon' },
        'Region III': { provinces: ['Aurora','Bataan','Bulacan','Nueva Ecija','Pampanga','Tarlac','Zambales'], island: 'Luzon' },
        'Region IV-A': { provinces: ['Batangas','Cavite','Laguna','Quezon','Rizal'], island: 'Luzon' },
        'MIMAROPA': { provinces: ['Marinduque','Occidental Mindoro','Oriental Mindoro','Palawan','Romblon'], island: 'Luzon' },
        'Region V': { provinces: ['Albay','Camarines Norte','Camarines Sur','Catanduanes','Masbate','Sorsogon'], island: 'Luzon' },
        'Region VI': { provinces: ['Aklan','Antique','Capiz','Guimaras','Iloilo'], island: 'Visayas' },
        'NIR': { provinces: ['Negros Occidental','Negros Oriental','Siquijor'], island: 'Visayas' },
        'Region VII': { provinces: ['Bohol','Cebu'], island: 'Visayas' },
        'Region VIII': { provinces: ['Biliran','Eastern Samar','Leyte','Northern Samar','Samar','Southern Leyte'], island: 'Visayas' },
        'Region IX': { provinces: ['Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay','Sulu'], island: 'Mindanao' },
        'Region X': { provinces: ['Bukidnon','Camiguin','Lanao del Norte','Misamis Occidental','Misamis Oriental'], island: 'Mindanao' },
        'Region XI': { provinces: ['Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental'], island: 'Mindanao' },
        'Region XII': { provinces: ['Cotabato','Sarangani','South Cotabato','Sultan Kudarat'], island: 'Mindanao' },
        'Region XIII': { provinces: ['Agusan del Norte','Agusan del Sur','Dinagat Islands','Surigao del Norte','Surigao del Sur'], island: 'Mindanao' },
        'BARMM': { provinces: ['Basilan','Lanao del Sur','Maguindanao del Norte','Maguindanao del Sur','Tawi-Tawi'], island: 'Mindanao' }
    };

    /* ---------- Color Themes ---------- */
    const THEMES = {
        dark: {
            label: 'Dark', dot: '#1a1a2e',
            bgDeepest: '#060a14', bgDeep: '#0a0e1a', bgCard: '#111827', bgCardHover: '#1a2235',
            glass: 'rgba(17,24,39,0.65)', glassBorder: 'rgba(255,255,255,0.08)',
            accent: '#818cf8', accentSecondary: '#60a5fa',
            textPrimary: '#f1f5f9', textSecondary: '#94a3b8', textMuted: '#64748b',
            unvisited: '#1e293b', visited: '#3b82f6', stayed: '#ef4444', stroke: '#0a0e1a',
            mapBg: '#111827'
        },
        light: {
            label: 'Light', dot: '#e8e0d4',
            bgDeepest: '#f5f0eb', bgDeep: '#ece5dc', bgCard: '#ffffff', bgCardHover: '#f8f5f0',
            glass: 'rgba(255,255,255,0.75)', glassBorder: 'rgba(0,0,0,0.08)',
            accent: '#6366f1', accentSecondary: '#3b82f6',
            textPrimary: '#1e293b', textSecondary: '#475569', textMuted: '#94a3b8',
            unvisited: '#e2e8f0', visited: '#3b82f6', stayed: '#ef4444', stroke: '#cbd5e1',
            mapBg: '#ffffff'
        },
        midnight: {
            label: 'Midnight', dot: '#0f172a',
            bgDeepest: '#020617', bgDeep: '#0f172a', bgCard: '#1e293b', bgCardHover: '#293548',
            glass: 'rgba(15,23,42,0.75)', glassBorder: 'rgba(99,102,241,0.15)',
            accent: '#818cf8', accentSecondary: '#a78bfa',
            textPrimary: '#e2e8f0', textSecondary: '#94a3b8', textMuted: '#64748b',
            unvisited: '#1e293b', visited: '#6366f1', stayed: '#ec4899', stroke: '#0f172a',
            mapBg: '#1e293b'
        },
        forest: {
            label: 'Forest', dot: '#14532d',
            bgDeepest: '#052e16', bgDeep: '#14532d', bgCard: '#1a3a2a', bgCardHover: '#22543d',
            glass: 'rgba(20,83,45,0.65)', glassBorder: 'rgba(74,222,128,0.15)',
            accent: '#4ade80', accentSecondary: '#22d3ee',
            textPrimary: '#f0fdf4', textSecondary: '#86efac', textMuted: '#4ade80',
            unvisited: '#1a3a2a', visited: '#22c55e', stayed: '#f97316', stroke: '#052e16',
            mapBg: '#1a3a2a'
        },
        rose: {
            label: 'Rose', dot: '#ffc0cb',
            bgDeepest: '#fff5f7', bgDeep: '#ffe4e9', bgCard: '#ffffff', bgCardHover: '#fff0f3',
            glass: 'rgba(255,255,255,0.8)', glassBorder: 'rgba(244,63,94,0.15)',
            accent: '#f43f5e', accentSecondary: '#ec4899',
            textPrimary: '#1e293b', textSecondary: '#64748b', textMuted: '#94a3b8',
            unvisited: '#fce7f3', visited: '#ec4899', stayed: '#e11d48', stroke: '#fda4af',
            mapBg: '#ffffff'
        },
        slate: {
            label: 'Slate', dot: '#94a3b8',
            bgDeepest: '#e2e8f0', bgDeep: '#cbd5e1', bgCard: '#f1f5f9', bgCardHover: '#e2e8f0',
            glass: 'rgba(241,245,249,0.8)', glassBorder: 'rgba(71,85,105,0.15)',
            accent: '#475569', accentSecondary: '#64748b',
            textPrimary: '#0f172a', textSecondary: '#334155', textMuted: '#64748b',
            unvisited: '#cbd5e1', visited: '#3b82f6', stayed: '#ef4444', stroke: '#94a3b8',
            mapBg: '#f1f5f9'
        },
        sunset: {
            label: 'Sunset', dot: '#78350f',
            bgDeepest: '#1c1004', bgDeep: '#2a1a08', bgCard: '#3d2712', bgCardHover: '#4a3218',
            glass: 'rgba(61,39,18,0.75)', glassBorder: 'rgba(251,191,36,0.15)',
            accent: '#fbbf24', accentSecondary: '#f97316',
            textPrimary: '#fef3c7', textSecondary: '#fcd34d', textMuted: '#b45309',
            unvisited: '#3d2712', visited: '#f59e0b', stayed: '#ef4444', stroke: '#1c1004',
            mapBg: '#3d2712'
        },
        arctic: {
            label: 'Arctic', dot: '#bfdbfe',
            bgDeepest: '#eff6ff', bgDeep: '#dbeafe', bgCard: '#ffffff', bgCardHover: '#eff6ff',
            glass: 'rgba(255,255,255,0.85)', glassBorder: 'rgba(59,130,246,0.12)',
            accent: '#2563eb', accentSecondary: '#0891b2',
            textPrimary: '#1e3a5f', textSecondary: '#3b82f6', textMuted: '#93c5fd',
            unvisited: '#dbeafe', visited: '#2563eb', stayed: '#dc2626', stroke: '#93c5fd',
            mapBg: '#ffffff'
        },
        lavender: {
            label: 'Lavender', dot: '#c4b5fd',
            bgDeepest: '#faf5ff', bgDeep: '#f3e8ff', bgCard: '#ffffff', bgCardHover: '#faf5ff',
            glass: 'rgba(255,255,255,0.85)', glassBorder: 'rgba(139,92,246,0.12)',
            accent: '#8b5cf6', accentSecondary: '#a78bfa',
            textPrimary: '#2e1065', textSecondary: '#6d28d9', textMuted: '#a78bfa',
            unvisited: '#ede9fe', visited: '#7c3aed', stayed: '#e11d48', stroke: '#c4b5fd',
            mapBg: '#ffffff'
        },
        mocha: {
            label: 'Mocha', dot: '#3e2723',
            bgDeepest: '#1a0e0a', bgDeep: '#2c1810', bgCard: '#3e2723', bgCardHover: '#4e342e',
            glass: 'rgba(62,39,35,0.75)', glassBorder: 'rgba(188,143,95,0.2)',
            accent: '#bc8f5f', accentSecondary: '#d4a574',
            textPrimary: '#efebe9', textSecondary: '#bcaaa4', textMuted: '#8d6e63',
            unvisited: '#3e2723', visited: '#8d6e63', stayed: '#ef5350', stroke: '#1a0e0a',
            mapBg: '#3e2723'
        },
        mono: {
            label: 'Mono', dot: '#ffffff',
            bgDeepest: '#fafafa', bgDeep: '#f5f5f5', bgCard: '#ffffff', bgCardHover: '#f5f5f5',
            glass: 'rgba(255,255,255,0.9)', glassBorder: 'rgba(0,0,0,0.1)',
            accent: '#171717', accentSecondary: '#404040',
            textPrimary: '#0a0a0a', textSecondary: '#404040', textMuted: '#a3a3a3',
            unvisited: '#e5e5e5', visited: '#404040', stayed: '#171717', stroke: '#d4d4d4',
            mapBg: '#ffffff'
        },
        monoBlack: {
            label: 'Mono (Black)', dot: '#171717',
            bgDeepest: '#000000', bgDeep: '#0a0a0a', bgCard: '#171717', bgCardHover: '#262626',
            glass: 'rgba(23,23,23,0.8)', glassBorder: 'rgba(255,255,255,0.1)',
            accent: '#e5e5e5', accentSecondary: '#a3a3a3',
            textPrimary: '#fafafa', textSecondary: '#d4d4d4', textMuted: '#737373',
            unvisited: '#262626', visited: '#a3a3a3', stayed: '#fafafa', stroke: '#0a0a0a',
            mapBg: '#171717'
        }
    };

    let currentTheme = 'dark';

    function getThemeColors() {
        return THEMES[currentTheme] || THEMES.dark;
    }

    const COLORS = {
        get unvisited() { return getThemeColors().unvisited; },
        get visited() { return getThemeColors().visited; },
        get stayed() { return getThemeColors().stayed; },
        get stroke() { return getThemeColors().stroke; }
    };

    /* ---------- State ---------- */
    let currentUser = null;
    let provinceLayers = [];
    let provinceGroups = {};  // provinceName -> [layers]
    let leafletMap = null;
    let carouselIndex = 0;
    let carouselTimer = null;

    /* ============================================
       1. TOAST NOTIFICATIONS
    ============================================ */
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✓', error: '✕', info: 'ℹ' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('out');
            setTimeout(() => toast.remove(), 350);
        }, 3000);
    }

    /* ============================================
       2. AUTHENTICATION MODULE
    ============================================ */
    /* ---------- localStorage Helpers ---------- */
    function getAllUsers() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
        catch { return {}; }
    }

    function saveAllUsers(users) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    }

    function getSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
        catch { return null; }
    }

    function setSession(username) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username }));
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
    }

    function registerUser(name, pin, alias, pictureData, travelerType) {
        const trimName = name.trim();
        const trimAlias = alias ? alias.trim() : '';
        if (!trimName) return { ok: false, msg: 'Please enter your full name.' };
        if (!trimAlias) return { ok: false, msg: 'Please enter an alias username.' };
        if (!/^\d{6}$/.test(pin)) return { ok: false, msg: 'PIN must be exactly 6 digits.' };

        const users = getAllUsers();
        const key = trimAlias.toLowerCase();
        if (users[key]) return { ok: false, msg: 'That alias is already taken.' };

        const user = {
            displayName: trimName,
            pin,
            alias: trimAlias,
            picture: pictureData || null,
            travelerType: travelerType || '🎒 Turista',
            provinces: {},
            customNotes: [],
            createdAt: new Date().toISOString()
        };
        users[key] = user;
        saveAllUsers(users);
        return { ok: true, key, user };
    }

    function loginUser(alias, pin) {
        const trimAlias = alias.trim();
        if (!trimAlias) return { ok: false, msg: 'Please enter your alias.' };
        if (!/^\d{6}$/.test(pin)) return { ok: false, msg: 'PIN must be exactly 6 digits.' };

        const users = getAllUsers();
        const key = trimAlias.toLowerCase();
        const user = users[key];
        if (!user) return { ok: false, msg: 'Alias not found. Please register first.' };
        if (user.pin !== pin) return { ok: false, msg: 'Incorrect PIN.' };
        return { ok: true, key, user };
    }

    function initProfileEditor() {
        const overlay = document.getElementById('edit-profile-overlay');
        const trigger = document.getElementById('user-profile-trigger');
        const cancelBtn = document.getElementById('edit-cancel');
        const submitBtn = document.getElementById('edit-submit');
        const aliasInput = document.getElementById('edit-alias');
        const pinInput = document.getElementById('edit-pin');
        const avatarInput = document.getElementById('edit-avatar-input');
        const avatarPreview = document.getElementById('edit-avatar-preview');
        const errorMsg = document.getElementById('edit-error');

        let currentPictureData = null;

        trigger?.addEventListener('click', () => {
            if (!currentUser || currentUser.isGuest) {
                showToast('Guest users cannot edit profile.', 'info');
                return;
            }
            aliasInput.value = currentUser.alias || '';
            pinInput.value = '';
            errorMsg.textContent = '';
            aliasInput.classList.remove('error');
            pinInput.classList.remove('error');
            
            currentPictureData = currentUser.picture;
            if (currentPictureData) {
                avatarPreview.innerHTML = `<img src="${currentPictureData}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                avatarPreview.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            }
            overlay.style.display = 'flex';
        });

        cancelBtn?.addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        avatarInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentPictureData = ev.target.result;
                avatarPreview.innerHTML = `<img src="${currentPictureData}" style="width:100%;height:100%;object-fit:cover;">`;
            };
            reader.readAsDataURL(file);
        });

        submitBtn?.addEventListener('click', () => {
            const trimAlias = aliasInput.value.trim();
            const newPin = pinInput.value;
            aliasInput.classList.remove('error');
            pinInput.classList.remove('error');

            if (!trimAlias) {
                errorMsg.textContent = 'Alias cannot be empty.';
                aliasInput.classList.add('error');
                return;
            }
            if (newPin && !/^\d{6}$/.test(newPin)) {
                errorMsg.textContent = 'New PIN must be exactly 6 digits.';
                pinInput.classList.add('error');
                return;
            }

            const users = getAllUsers();
            const oldKey = currentUser.key;
            const newKey = trimAlias.toLowerCase();

            // Check if new alias is taken by another user
            if (newKey !== oldKey && users[newKey]) {
                errorMsg.textContent = 'That alias is already taken.';
                aliasInput.classList.add('error');
                return;
            }

            // Update user data
            const userData = users[oldKey] || {};
            userData.alias = trimAlias;
            userData.picture = currentPictureData;
            if (newPin) userData.pin = newPin;

            // Handle key change
            if (oldKey !== newKey) {
                delete users[oldKey];
                users[newKey] = userData;
                setSession(newKey);
                currentUser.key = newKey;
            } else {
                users[oldKey] = userData;
            }

            saveAllUsers(users);

            currentUser.alias = trimAlias;
            if (newPin) currentUser.pin = newPin;
            currentUser.picture = currentPictureData;

            updateUserBar();
            overlay.style.display = 'none';
            showToast('Profile updated successfully!', 'success');
        });
    }

    function initAuth() {
        const overlay = document.getElementById('auth-overlay');
        const tabBtns = overlay.querySelectorAll('.auth-tab');
        const nameInput = document.getElementById('auth-name');
        const aliasInput = document.getElementById('auth-alias');
        const pinInput = document.getElementById('auth-pin');
        const submitBtn = document.getElementById('auth-submit');
        const errorMsg = document.getElementById('auth-error');
        const guestLink = document.getElementById('auth-guest-link');
        
        const avatarSection = document.getElementById('auth-avatar-section');
        const nameGroup = document.getElementById('auth-name-group');
        const avatarInput = document.getElementById('auth-avatar-input');
        const avatarPreview = document.getElementById('auth-avatar-preview');

        let mode = 'login';
        let currentPictureData = null;

        // Avatar Upload
        avatarInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                currentPictureData = ev.target.result;
                avatarPreview.innerHTML = `<img src="${currentPictureData}" style="width:100%;height:100%;object-fit:cover;">`;
            };
            reader.readAsDataURL(file);
        });

        // Check existing session from localStorage
        const session = getSession();
        if (session) {
            const users = getAllUsers();
            const user = users[session.username];
            if (user) {
                currentUser = { key: session.username, ...user };
                overlay.classList.add('hidden');
                setTimeout(() => overlay.style.display = 'none', 500);
                onUserReady();
                return;
            } else {
                clearSession();
            }
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                mode = btn.dataset.mode;
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                submitBtn.textContent = mode === 'login' ? 'Log In' : 'Register';
                errorMsg.textContent = '';
                nameInput.classList.remove('error');
                pinInput.classList.remove('error');
                
                // Toggle name and avatar
                const typeGroup = document.getElementById('auth-type-group');
                if (mode === 'register') {
                    avatarSection.style.display = 'flex';
                    nameGroup.style.display = 'block';
                    if (typeGroup) typeGroup.style.display = 'block';
                } else {
                    avatarSection.style.display = 'none';
                    nameGroup.style.display = 'none';
                    if (typeGroup) typeGroup.style.display = 'none';
                }
            });
        });

        submitBtn.addEventListener('click', () => handleAuthSubmit(mode, nameInput, aliasInput, pinInput, currentPictureData, errorMsg, overlay));
        pinInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAuthSubmit(mode, nameInput, aliasInput, pinInput, currentPictureData, errorMsg, overlay);
        });
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (mode === 'register') aliasInput.focus();
                else pinInput.focus();
            }
        });
        aliasInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') pinInput.focus();
        });

        guestLink.addEventListener('click', (e) => {
            e.preventDefault();
            currentUser = { key: '__guest__', displayName: 'Explorer', alias: 'Guest', provinces: {}, isGuest: true };
            overlay.classList.add('hidden');
            setTimeout(() => overlay.style.display = 'none', 500);
            onUserReady();
            showToast('Continuing as guest. Progress won\'t be saved.', 'info');
        });

        // Google Sign-In button
        const googleBtn = document.getElementById('google-signin-btn');
        if (googleBtn) {
            if (!firebaseReady) {
                googleBtn.style.opacity = '0.5';
                googleBtn.title = 'Firebase not configured';
            }
            googleBtn.addEventListener('click', () => handleGoogleSignIn(overlay));
        }

        // Check if Firebase user is already signed in
        if (firebaseReady) {
            firebaseAuth.onAuthStateChanged(async (gUser) => {
                if (gUser && !currentUser) {
                    // User already signed in via Firebase, auto-load
                    const cloudData = await loadFromCloud();
                    if (cloudData) {
                        currentUser = {
                            key: gUser.uid,
                            displayName: cloudData.displayName || gUser.displayName || 'Explorer',
                            alias: cloudData.alias || gUser.displayName?.split(' ')[0] || 'Traveler',
                            pin: '000000',
                            picture: cloudData.picture || gUser.photoURL || null,
                            travelerType: cloudData.travelerType || '🎒 Turista',
                            provinces: cloudData.provinces || {},
                            customNotes: cloudData.customNotes || [],
                            bucketChecked: cloudData.bucketChecked || [],
                            isFirebase: true
                        };
                        setSession(gUser.uid);
                        overlay.classList.add('hidden');
                        setTimeout(() => overlay.style.display = 'none', 500);
                        onUserReady();
                    }
                }
            });
        }
    }

    function handleAuthSubmit(mode, nameInput, aliasInput, pinInput, pictureData, errorMsg, overlay) {
        nameInput.classList.remove('error');
        aliasInput.classList.remove('error');
        pinInput.classList.remove('error');

        let travelerType = '🎒 Turista';
        const typeSelect = document.getElementById('auth-traveler-type');
        if (typeSelect) travelerType = typeSelect.value;

        const result = (mode === 'login'
            ? loginUser(aliasInput.value, pinInput.value)
            : registerUser(nameInput.value, pinInput.value, aliasInput.value, pictureData, travelerType));

        if (!result.ok) {
            errorMsg.textContent = result.msg;
            if (result.msg.toLowerCase().includes('name')) nameInput.classList.add('error');
            if (result.msg.toLowerCase().includes('alias')) aliasInput.classList.add('error');
            if (result.msg.toLowerCase().includes('pin')) pinInput.classList.add('error');
            return;
        }

        currentUser = { key: result.key, ...result.user };
        setSession(result.key);
        overlay.classList.add('hidden');
        setTimeout(() => overlay.style.display = 'none', 500);
        onUserReady();
        showToast(mode === 'login'
            ? `Welcome back, ${result.user.displayName}!`
            : `Registered! Welcome, ${result.user.displayName}!`,
            'success'
        );
    }

    function onUserReady() {
        updateUserBar();
        loadProvinceStates();
        updateStats();
    }

    function updateUserBar() {
        const primary = document.getElementById('user-display-name');
        const aliasEl = document.getElementById('user-display-alias');
        const avatarLetter = document.getElementById('user-avatar-letter');
        const avatarImg = document.getElementById('user-avatar-img');
        const saveBtn = document.getElementById('btn-save');

        if (currentUser) {
            const name = currentUser.displayName || 'Explorer';
            const alias = currentUser.alias || '';
            const tType = currentUser.travelerType || '';
            primary.textContent = name;
            aliasEl.textContent = alias ? `@${alias}` : (currentUser.isGuest ? 'Guest User' : 'Traveler');
            
            const badgeEl = document.getElementById('user-traveler-badge');
            if (badgeEl) {
                if (tType && !currentUser.isGuest) {
                    badgeEl.style.display = 'inline-block';
                    badgeEl.textContent = tType.split('(')[0].trim();
                } else {
                    badgeEl.style.display = 'none';
                }
            }
            
            if (currentUser.picture) {
                avatarImg.src = currentUser.picture;
                avatarImg.style.display = 'block';
                avatarLetter.style.display = 'none';
            } else {
                avatarImg.style.display = 'none';
                avatarLetter.style.display = 'block';
                avatarLetter.textContent = name.charAt(0).toUpperCase();
            }

            if (currentUser.isGuest) {
                if(saveBtn) saveBtn.style.display = 'none';
            }
        }
    }

    function logout() {
        clearSession();
        currentUser = null;
        // Sign out of Firebase too
        if (firebaseReady && firebaseAuth) {
            firebaseAuth.signOut().catch(() => {});
        }
        location.reload();
    }

    /* ============================================
       3. CAROUSEL MODULE
    ============================================ */
    function initCarousel() {
        const container = document.getElementById('carousel');
        const dotsContainer = document.getElementById('carousel-dots');

        // Create slides
        CAROUSEL_IMAGES.forEach((src, i) => {
            const slide = document.createElement('div');
            slide.className = `hero-slide${i === 0 ? ' active' : ''}`;
            slide.style.backgroundImage = `url('${src}')`;
            container.appendChild(slide);

            const dot = document.createElement('button');
            dot.className = `carousel-dot${i === 0 ? ' active' : ''}`;
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        });

        startCarousel();
    }

    function startCarousel() {
        carouselTimer = setInterval(() => {
            goToSlide((carouselIndex + 1) % CAROUSEL_IMAGES.length);
        }, 5000);
    }

    function goToSlide(index) {
        const slides = document.querySelectorAll('.hero-slide');
        const dots = document.querySelectorAll('.carousel-dot');

        slides[carouselIndex]?.classList.remove('active');
        dots[carouselIndex]?.classList.remove('active');

        carouselIndex = index;

        slides[carouselIndex]?.classList.add('active');
        dots[carouselIndex]?.classList.add('active');

        // Reset timer
        clearInterval(carouselTimer);
        startCarousel();
    }

    /* ============================================
       4. MAP MODULE
    ============================================ */
    function resolveProvinceName(rawName, featureId) {
        if (!rawName) return null;
        // NCR cities (Counted as Metro Manila)
        if (NCR_CITIES.includes(rawName)) return 'Metro Manila';

        // Handle duplicate names between cities and provinces
        if (rawName === 'Isabela') return featureId === 'PH.IB' ? 'Isabela' : 'Basilan';
        if (rawName === 'Cotabato') return featureId === 'PH.NC' ? 'Cotabato' : 'Maguindanao';
        if (rawName === 'Iloilo') return 'Iloilo';
        if (rawName === 'Cebu') return 'Cebu';

        // City→Province merge
        if (CITY_TO_PROVINCE[rawName]) {
            return CITY_TO_PROVINCE[rawName];
        }
        // Display name mapping
        if (DISPLAY_NAMES[rawName]) return DISPLAY_NAMES[rawName];
        return rawName;
    }

    function initMap() {
        leafletMap = L.map('map', {
            zoomSnap: 0.1,
            attributionControl: false,
            zoomControl: false,
            scrollWheelZoom: false,
            dragging: true,
            doubleClickZoom: false
        }).setView([12.8797, 121.7740], 6);

        L.control.zoom({ position: 'topright' }).addTo(leafletMap);

        fetch('https://raw.githubusercontent.com/markmarkoh/datamaps/master/src/js/data/phl.topo.json')
            .then(res => res.json())
            .then(topoData => {
                const geojsonData = topojson.feature(topoData, topoData.objects.phl);

                // Filter out null/-99 features
                geojsonData.features = geojsonData.features.filter(f => {
                    const name = f.properties.name;
                    const id = f.id;
                    if (!name || id === '-99' || !id) return false;
                    return true;
                });

                const tc = getThemeColors();

                const geoLayer = L.geoJSON(geojsonData, {
                    style: {
                        fillColor: tc.unvisited,
                        weight: 1,
                        opacity: 1,
                        color: tc.stroke,
                        fillOpacity: 1
                    },
                    onEachFeature: (feature, layer) => {
                        const rawName = feature.properties.name || 'Unknown';
                        const featureId = feature.id || '';
                        const provinceName = resolveProvinceName(rawName, featureId);
                        if (!provinceName) return;

                        layer._provinceName = provinceName;
                        layer._rawName = rawName;
                        layer._status = 0;

                        // Group layers by province
                        if (!provinceGroups[provinceName]) {
                            provinceGroups[provinceName] = [];
                        }
                        provinceGroups[provinceName].push(layer);

                        layer.on('click', function () {
                            cycleProvinceGroup(this._provinceName);
                        });

                        layer.on('mouseover', function () {
                            const group = provinceGroups[this._provinceName];
                            if (group) group.forEach(l => {
                                if (l._status === 0) l.setStyle({ fillColor: getHoverColor(), fillOpacity: 1 });
                                l.setStyle({ weight: 2 });
                            });
                        });

                        layer.on('mouseout', function () {
                            const group = provinceGroups[this._provinceName];
                            if (group) group.forEach(l => {
                                if (l._status === 0) l.setStyle({ fillColor: getThemeColors().unvisited });
                                l.setStyle({ weight: 1 });
                            });
                        });

                        layer.bindTooltip(provinceName, {
                            sticky: true,
                            className: 'glass-tooltip'
                        });

                        provinceLayers.push(layer);
                    }
                }).addTo(leafletMap);
                window.globalGeoLayer = geoLayer;

                leafletMap.fitBounds(geoLayer.getBounds(), { paddingTopLeft: [15, 100], paddingBottomRight: [15, 15] });

                if (currentUser) {
                    loadProvinceStates();
                    updateStats();
                }

                updateRegionBreakdown();
            })
            .catch(err => {
                console.error('Failed to load map data:', err);
                showToast('Failed to load map. Check your connection.', 'error');
            });
    }

    function getHoverColor() {
        const tc = getThemeColors();
        // Return a slightly lighter/different shade for hover
        return tc.bgCardHover;
    }

    function cycleProvinceGroup(provinceName) {
        const group = provinceGroups[provinceName];
        if (!group || group.length === 0) return;

        const newStatus = (group[0]._status + 1) % 3;
        const colors = [getThemeColors().unvisited, getThemeColors().visited, getThemeColors().stayed];

        group.forEach(l => {
            l._status = newStatus;
            l.setStyle({ fillColor: colors[newStatus] });
        });

        updateStats();
        saveProvinceStates();
    }

    function getUniqueProvinceStats() {
        const seen = {};
        Object.keys(provinceGroups).forEach(name => {
            const group = provinceGroups[name];
            if (group.length > 0) {
                seen[name] = group[0]._status;
            }
        });
        return seen;
    }

    function updateStats() {
        const stats = getUniqueProvinceStats();
        let visited = 0, stayed = 0;
        Object.values(stats).forEach(s => {
            if (s === 1) visited++;
            if (s === 2) stayed++;
        });

        const total = visited + stayed;
        const pct = Math.round((total / TOTAL_PROVINCES) * 100);

        animateValue('stat-provinces', total);
        animateValue('stat-visited', visited);
        animateValue('stat-stayed', stayed);
        document.getElementById('stat-percent').textContent = pct + '%';
        document.getElementById('progress-fill').style.width = pct + '%';

        updateRegionBreakdown();
    }

    function updateRegionBreakdown() {
        const stats = getUniqueProvinceStats();
        const islandTotals = { Luzon: { done: 0, total: 0 }, Visayas: { done: 0, total: 0 }, Mindanao: { done: 0, total: 0 } };

        // Track Maguindanao as both del Norte and del Sur
        const maguindanaoStatus = stats['Maguindanao'] || 0;

        Object.entries(REGIONS).forEach(([regionName, regionData]) => {
            let done = 0;
            const total = regionData.provinces.length;

            regionData.provinces.forEach(p => {
                let s = stats[p];
                // Handle Maguindanao split
                if ((p === 'Maguindanao del Norte' || p === 'Maguindanao del Sur') && s === undefined) {
                    s = maguindanaoStatus;
                }
                if (s && s > 0) done++;
            });

            // Update DOM
            const el = document.getElementById('region-' + regionName.replace(/\s+/g, '-').toLowerCase());
            if (el) {
                const countEl = el.querySelector('.region-count');
                if (countEl) countEl.textContent = `${done}/${total}`;
                if (done === total && total > 0) {
                    el.classList.add('complete');
                } else {
                    el.classList.remove('complete');
                }
            }

            // Island groups
            if (islandTotals[regionData.island]) {
                islandTotals[regionData.island].done += done;
                islandTotals[regionData.island].total += total;
            }
        });

        // Update island group displays
        ['Luzon', 'Visayas', 'Mindanao'].forEach(island => {
            const data = islandTotals[island];
            const el = document.getElementById('island-' + island.toLowerCase());
            if (el) {
                const countEl = el.querySelector('.island-count');
                const barEl = el.querySelector('.island-bar-fill');
                if (countEl) countEl.textContent = `${data.done}/${data.total}`;
                if (barEl) barEl.style.width = data.total > 0 ? `${(data.done / data.total) * 100}%` : '0%';
            }
        });
    }

    function animateValue(id, target) {
        const el = document.getElementById(id);
        if (!el) return;
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;

        const duration = 400;
        const start = performance.now();

        function tick(now) {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.round(current + (target - current) * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    /* ============================================
       5. SAVE / LOAD MODULE
    ============================================ */
    function saveProvinceStates() {
        if (!currentUser || currentUser.isGuest) return;

        const states = {};
        Object.entries(provinceGroups).forEach(([name, group]) => {
            if (group.length > 0 && group[0]._status !== 0) {
                states[name] = group[0]._status;
            }
        });

        currentUser.provinces = states;
        currentUser.lastSaved = new Date().toISOString();
        
        // Save to localStorage
        const users = getAllUsers();
        if (users[currentUser.key]) {
            users[currentUser.key].provinces = states;
            users[currentUser.key].lastSaved = currentUser.lastSaved;
            saveAllUsers(users);
        }

        // Sync to cloud (non-blocking)
        syncToCloud();
    }

    function loadProvinceStates() {
        if (!currentUser || currentUser.isGuest || Object.keys(provinceGroups).length === 0) return;

        const saved = currentUser.provinces;
        if (!saved) return;

        const tc = getThemeColors();
        const colors = [tc.unvisited, tc.visited, tc.stayed];

        Object.entries(saved).forEach(([name, status]) => {
            const group = provinceGroups[name];
            if (group) {
                group.forEach(l => {
                    l._status = status;
                    l.setStyle({ fillColor: colors[status] });
                });
            }
        });
    }

    function manualSave() {
        if (!currentUser || currentUser.isGuest) {
            showToast('Guest users cannot save. Please register.', 'error');
            return;
        }
        saveProvinceStates();
        if (currentUser.isFirebase) {
            showToast('Progress saved & synced to cloud! ☁️', 'success');
        } else {
            showToast('Progress saved!', 'success');
        }
    }

    function performReset() {
        const tc = getThemeColors();
        Object.values(provinceGroups).forEach(group => {
            group.forEach(l => {
                l._status = 0;
                l.setStyle({ fillColor: tc.unvisited });
            });
        });
        updateStats();
        saveProvinceStates();
        showToast('Map has been reset.', 'info');
    }

    /* ============================================
       6. EXPORT & DOWNLOAD MODULE
    ============================================ */
    function downloadImage(format) {
        showToast(`Generating ${format.toUpperCase()}...`, 'info');
        const mapContainer = document.getElementById('map');
        
        if (window.globalGeoLayer && leafletMap) {
            leafletMap.fitBounds(window.globalGeoLayer.getBounds(), { paddingTopLeft: [15, 100], paddingBottomRight: [15, 15], animate: false });
        }

        const tc = getThemeColors();
        const clock = document.getElementById('pst-clock');
        if (clock) clock.style.display = 'none';

        setTimeout(() => {
            html2canvas(mapContainer, {
                backgroundColor: tc.bgCard,
                scale: 2, useCORS: true, logging: false
            }).then(canvas => {
                if (clock) clock.style.display = 'flex';

                const link = document.createElement('a');
                link.download = `LAKbayGAbayPh_Map_${new Date().getTime()}.${format}`;
                link.href = canvas.toDataURL(`image/${format === 'jpg' ? 'jpeg' : format}`);
                link.click();
                showToast('Download complete!', 'success');
            }).catch(err => {
                if (clock) clock.style.display = 'flex';
                console.error('Image generation error:', err);
                showToast('Failed to generate image.', 'error');
            });
        }, 500);
    }

    function downloadPDF() {
        showToast('Generating your PDF…', 'info');
        const mapContainer = document.getElementById('map');
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
            showToast('PDF libraries still loading. Try again.', 'error');
            return;
        }

        if (window.globalGeoLayer && leafletMap) {
            leafletMap.fitBounds(window.globalGeoLayer.getBounds(), { paddingTopLeft: [15, 100], paddingBottomRight: [15, 15], animate: false });
        }

        const tc = getThemeColors();
        const clock = document.getElementById('pst-clock');
        if (clock) clock.style.display = 'none';

        setTimeout(() => {
            html2canvas(mapContainer, {
                backgroundColor: tc.bgCard,
                scale: 2, useCORS: true, logging: false
            }).then(canvas => {
                if (clock) clock.style.display = 'flex';

                const { jsPDF } = jspdf;
                const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                const pageW = pdf.internal.pageSize.getWidth();
                const pageH = pdf.internal.pageSize.getHeight();

                const bgColor = hexToRgb(tc.bgDeep);
                pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                pdf.rect(0, 0, pageW, pageH, 'F');

                const accentColor = hexToRgb(tc.accent);
                pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
                pdf.rect(0, 0, pageW, 3, 'F');

                const textColor = hexToRgb(tc.textPrimary);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                pdf.setFontSize(22);
                pdf.text('LAKbayGAbayPh', pageW / 2, 22, { align: 'center' });

                const subColor = hexToRgb(tc.textMuted);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                pdf.setFontSize(9);
                pdf.text('Traversing Project 82 - Mapasayo Generator', pageW / 2, 29, { align: 'center' });

                const userName = currentUser ? currentUser.displayName : 'Explorer';
                const dateStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                pdf.setFontSize(8);
                pdf.text(`Traveler: ${userName}  |  Generated: ${dateStr}`, pageW / 2, 36, { align: 'center' });

                const imgData = canvas.toDataURL('image/png');
                const mapAspect = canvas.width / canvas.height;
                const mapW = pageW - 20;
                const mapH = mapW / mapAspect;
                const mapY = 42;
                pdf.addImage(imgData, 'PNG', 10, mapY, mapW, mapH);

                const stats = getUniqueProvinceStats();
                let visited = 0, stayed = 0;
                Object.values(stats).forEach(s => { if (s === 1) visited++; if (s === 2) stayed++; });
                const total = visited + stayed;
                const pct = Math.round((total / TOTAL_PROVINCES) * 100);
                const statsY = mapY + mapH + 12;

                const cardColor = hexToRgb(tc.bgCard);
                pdf.setFillColor(cardColor.r, cardColor.g, cardColor.b);
                pdf.roundedRect(10, statsY - 4, pageW - 20, 22, 3, 3, 'F');

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                const col1 = 30, col2 = pageW / 2, col3 = pageW - 30;
                pdf.text(String(total), col1, statsY + 4, { align: 'center' });
                pdf.text(String(visited), col2, statsY + 4, { align: 'center' });
                pdf.text(String(stayed), col3, statsY + 4, { align: 'center' });

                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(6);
                pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
                pdf.text('PROVINCES', col1, statsY + 10, { align: 'center' });
                pdf.text('BEEN THERE', col2, statsY + 10, { align: 'center' });
                pdf.text('STAYED THERE', col3, statsY + 10, { align: 'center' });

                pdf.setFontSize(7);
                pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                pdf.text(`${pct}% of Project 82 Complete`, pageW / 2, statsY + 16, { align: 'center' });

                /* ---------- Legend ---------- */
                const legendY = statsY + 26;
                pdf.setFontSize(6);
                pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                pdf.text('LEGEND', 10, legendY);

                const unvisitedC = hexToRgb(tc.unvisited);
                pdf.setFillColor(unvisitedC.r, unvisitedC.g, unvisitedC.b);
                pdf.circle(14, legendY + 5, 2, 'F');
                pdf.setFontSize(7);
                pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                pdf.text('Unvisited', 18, legendY + 6.5);

                const visitedC = hexToRgb(tc.visited);
                pdf.setFillColor(visitedC.r, visitedC.g, visitedC.b);
                pdf.circle(50, legendY + 5, 2, 'F');
                pdf.text('Been There', 54, legendY + 6.5);

                const stayedC = hexToRgb(tc.stayed);
                pdf.setFillColor(stayedC.r, stayedC.g, stayedC.b);
                pdf.circle(90, legendY + 5, 2, 'F');
                pdf.text('Stayed There', 94, legendY + 6.5);

                /* ---------- PAGE 2: Island Groups & Region Breakdown ---------- */
                pdf.addPage();
                pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                pdf.rect(0, 0, pageW, pageH, 'F');
                pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
                pdf.rect(0, 0, pageW, 3, 'F');

                // Page 2 Title
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                pdf.setFontSize(16);
                pdf.text('Island Groups & Region Breakdown', pageW / 2, 18, { align: 'center' });
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                pdf.text(`Traveler: ${userName}  |  ${pct}% of Project 82 Complete`, pageW / 2, 25, { align: 'center' });

                // Compute island & region data
                const islandTotals = { Luzon: { done: 0, total: 0 }, Visayas: { done: 0, total: 0 }, Mindanao: { done: 0, total: 0 } };
                const maguindanaoStatus = stats['Maguindanao'] || 0;
                const regionResults = [];

                Object.entries(REGIONS).forEach(([regionName, regionData]) => {
                    let done = 0;
                    const rTotal = regionData.provinces.length;
                    const provinceDetails = [];

                    regionData.provinces.forEach(p => {
                        let s = stats[p];
                        if ((p === 'Maguindanao del Norte' || p === 'Maguindanao del Sur') && s === undefined) {
                            s = maguindanaoStatus;
                        }
                        const status = s && s > 0 ? (s === 2 ? 'Stayed' : 'Been There') : 'Unvisited';
                        if (s && s > 0) done++;
                        provinceDetails.push({ name: p, status, statusCode: s || 0 });
                    });

                    regionResults.push({ name: regionName, island: regionData.island, done, total: rTotal, provinces: provinceDetails });

                    if (islandTotals[regionData.island]) {
                        islandTotals[regionData.island].done += done;
                        islandTotals[regionData.island].total += rTotal;
                    }
                });

                // --- Island Group Summary Cards ---
                let islandY = 33;
                const islandCardW = (pageW - 30) / 3;
                const islandCardH = 28;

                ['Luzon', 'Visayas', 'Mindanao'].forEach((island, idx) => {
                    const data = islandTotals[island];
                    const islandPct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
                    const cardX = 10 + idx * (islandCardW + 5);

                    pdf.setFillColor(cardColor.r, cardColor.g, cardColor.b);
                    pdf.roundedRect(cardX, islandY, islandCardW, islandCardH, 3, 3, 'F');

                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(11);
                    pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                    pdf.text(island, cardX + islandCardW / 2, islandY + 10, { align: 'center' });

                    pdf.setFontSize(9);
                    pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
                    pdf.text(`${data.done} / ${data.total}`, cardX + islandCardW / 2, islandY + 17, { align: 'center' });

                    // Progress bar
                    const barX = cardX + 6;
                    const barW = islandCardW - 12;
                    const barH = 3;
                    const barY2 = islandY + 21;
                    pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                    pdf.roundedRect(barX, barY2, barW, barH, 1.5, 1.5, 'F');
                    if (islandPct > 0) {
                        pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
                        pdf.roundedRect(barX, barY2, Math.max(barW * islandPct / 100, 3), barH, 1.5, 1.5, 'F');
                    }

                    pdf.setFontSize(6);
                    pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                    pdf.text(`${islandPct}%`, cardX + islandCardW / 2, islandY + 27, { align: 'center' });
                });

                // --- Region Breakdown Table ---
                let curY = islandY + islandCardH + 10;

                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                pdf.text('Region Breakdown', 10, curY);
                curY += 6;

                // Table header
                pdf.setFillColor(cardColor.r, cardColor.g, cardColor.b);
                pdf.roundedRect(10, curY - 4, pageW - 20, 8, 2, 2, 'F');
                pdf.setFontSize(6.5);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
                pdf.text('REGION', 14, curY + 1);
                pdf.text('ISLAND', 70, curY + 1);
                pdf.text('PROGRESS', 105, curY + 1);
                pdf.text('BEEN', 140, curY + 1);
                pdf.text('STAYED', 160, curY + 1);
                pdf.text('STATUS', pageW - 14, curY + 1, { align: 'right' });
                curY += 8;

                regionResults.forEach((region, rIdx) => {
                    // Check if we need a new page
                    if (curY > pageH - 25) {
                        pdf.addPage();
                        pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                        pdf.rect(0, 0, pageW, pageH, 'F');
                        pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
                        pdf.rect(0, 0, pageW, 3, 'F');
                        curY = 15;
                    }

                    // Alternating row background
                    if (rIdx % 2 === 0) {
                        pdf.setFillColor(cardColor.r, cardColor.g, cardColor.b);
                        pdf.rect(10, curY - 4, pageW - 20, 7, 'F');
                    }

                    const regionPct = region.total > 0 ? Math.round((region.done / region.total) * 100) : 0;
                    let regionBeen = 0, regionStayed = 0;
                    region.provinces.forEach(p => {
                        if (p.statusCode === 1) regionBeen++;
                        if (p.statusCode === 2) regionStayed++;
                    });

                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(7);
                    pdf.setTextColor(textColor.r, textColor.g, textColor.b);
                    pdf.text(region.name, 14, curY);

                    pdf.setFont('helvetica', 'normal');
                    pdf.setFontSize(6.5);
                    pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                    pdf.text(region.island, 70, curY);
                    pdf.text(`${region.done}/${region.total}`, 105, curY);
                    pdf.text(String(regionBeen), 140, curY);
                    pdf.text(String(regionStayed), 160, curY);

                    // Status indicator
                    if (region.done === region.total && region.total > 0) {
                        pdf.setTextColor(45, 212, 191); // teal - complete
                        pdf.setFont('helvetica', 'bold');
                        pdf.text('COMPLETE', pageW - 14, curY, { align: 'right' });
                    } else if (region.done > 0) {
                        pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
                        pdf.text(`${regionPct}%`, pageW - 14, curY, { align: 'right' });
                    } else {
                        pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                        pdf.text('—', pageW - 14, curY, { align: 'right' });
                    }
                    curY += 7;

                    // Province details under each region
                    region.provinces.forEach(prov => {
                        if (curY > pageH - 20) {
                            pdf.addPage();
                            pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
                            pdf.rect(0, 0, pageW, pageH, 'F');
                            pdf.setFillColor(accentColor.r, accentColor.g, accentColor.b);
                            pdf.rect(0, 0, pageW, 3, 'F');
                            curY = 15;
                        }

                        pdf.setFont('helvetica', 'normal');
                        pdf.setFontSize(6);
                        pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                        pdf.text(`   • ${prov.name}`, 18, curY);

                        // Status dot
                        if (prov.statusCode === 2) {
                            pdf.setFillColor(stayedC.r, stayedC.g, stayedC.b);
                            pdf.circle(105, curY - 1, 1.5, 'F');
                            pdf.setTextColor(stayedC.r, stayedC.g, stayedC.b);
                            pdf.text('Stayed', 109, curY);
                        } else if (prov.statusCode === 1) {
                            pdf.setFillColor(visitedC.r, visitedC.g, visitedC.b);
                            pdf.circle(105, curY - 1, 1.5, 'F');
                            pdf.setTextColor(visitedC.r, visitedC.g, visitedC.b);
                            pdf.text('Been There', 109, curY);
                        } else {
                            pdf.setFillColor(unvisitedC.r, unvisitedC.g, unvisitedC.b);
                            pdf.circle(105, curY - 1, 1.5, 'F');
                            pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                            pdf.text('Unvisited', 109, curY);
                        }
                        curY += 5;
                    });
                    curY += 2; // gap between regions
                });

                /* ---------- Footer on all pages ---------- */
                const totalPages = pdf.internal.getNumberOfPages();
                const authCode = btoa(userName + ':' + Date.now()).substring(0, 16).toUpperCase();
                for (let p = 1; p <= totalPages; p++) {
                    pdf.setPage(p);
                    pdf.setFontSize(6);
                    pdf.setFont('helvetica', 'normal');
                    pdf.setTextColor(subColor.r, subColor.g, subColor.b);
                    pdf.text('This document was generated by LAKbayGAbayPh - Project 82 Mapasayo Generator', pageW / 2, pageH - 12, { align: 'center' });
                    pdf.text(`© ${new Date().getFullYear()} LAKbayGAbayPh. Verified authentic document.`, pageW / 2, pageH - 8, { align: 'center' });
                    pdf.setFontSize(5);
                    pdf.text(`Page ${p} of ${totalPages}`, 10, pageH - 5);
                    pdf.text(`Auth: ${authCode}`, pageW - 10, pageH - 5, { align: 'right' });
                }

                pdf.save(`LAKbayGAbayPh_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
                showToast('PDF downloaded!', 'success');
            }).catch(err => {
                if (clock) clock.style.display = 'flex';
                console.error('PDF generation error:', err);
                showToast('Failed to generate PDF.', 'error');
            });
        }, 500);
    }

    function hexToRgb(hex) {
        if (!hex || hex.startsWith('rgb')) return { r: 10, g: 14, b: 26 };
        hex = hex.replace('#', '');
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    /* ============================================
       7. UI COMPONENTS (Clock, Dropdown, Modal)
    ============================================ */
    function startPSTClock() {
        const timeEl = document.getElementById('pst-time');
        const dateEl = document.getElementById('pst-date');
        if (!timeEl || !dateEl) return;

        function updateClock() {
            const now = new Date();
            const timeStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
            }).format(now);
            const dateStr = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                weekday: 'short', month: 'short', day: '2-digit', year: 'numeric'
            }).format(now);
            
            timeEl.textContent = timeStr;
            dateEl.textContent = dateStr;
        }
        updateClock();
        setInterval(updateClock, 1000);
    }

    function initDownloadMenu() {
        const btn = document.getElementById('btn-download');
        const dropdown = document.getElementById('download-dropdown');
        const menu = document.getElementById('download-menu');
        if (!btn || !dropdown || !menu) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
        });

        menu.querySelectorAll('.download-option').forEach(opt => {
            opt.addEventListener('click', () => {
                dropdown.classList.remove('open');
                const format = opt.dataset.format;
                if (format === 'pdf') downloadPDF();
                else downloadImage(format);
            });
        });
    }

    function initResetModal() {
        const btnReset = document.getElementById('btn-reset');
        const modal = document.getElementById('reset-modal');
        const btnCancel = document.getElementById('reset-cancel');
        const btnConfirm = document.getElementById('reset-confirm');
        if (!btnReset || !modal) return;

        btnReset.addEventListener('click', () => {
            modal.style.display = 'flex';
        });
        btnCancel.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        btnConfirm.addEventListener('click', () => {
            modal.style.display = 'none';
            performReset();
        });
    }

    /* ============================================
       8. THEME MODULE
    ============================================ */
    function applyTheme(themeKey) {
        const theme = THEMES[themeKey];
        if (!theme) return;
        currentTheme = themeKey;

        const root = document.documentElement;
        root.style.setProperty('--bg-deepest', theme.bgDeepest);
        root.style.setProperty('--bg-deep', theme.bgDeep);
        root.style.setProperty('--bg-card', theme.bgCard);
        root.style.setProperty('--bg-card-hover', theme.bgCardHover);
        root.style.setProperty('--glass', theme.glass);
        root.style.setProperty('--glass-border', theme.glassBorder);
        root.style.setProperty('--accent-indigo', theme.accent);
        root.style.setProperty('--accent-blue', theme.accentSecondary);
        root.style.setProperty('--text-primary', theme.textPrimary);
        root.style.setProperty('--text-secondary', theme.textSecondary);
        root.style.setProperty('--text-muted', theme.textMuted);
        root.style.setProperty('--visited-blue', theme.visited);
        root.style.setProperty('--stayed-red', theme.stayed);
        root.style.setProperty('--unvisited', theme.unvisited);

        // Update map layers
        const colors = [theme.unvisited, theme.visited, theme.stayed];
        provinceLayers.forEach(l => {
            l.setStyle({
                fillColor: colors[l._status],
                color: theme.stroke
            });
        });

        // Update map background
        const mapEl = document.getElementById('map');
        if (mapEl) mapEl.style.background = theme.mapBg;

        // Update active theme indicator
        document.querySelectorAll('.theme-option').forEach(el => {
            el.classList.toggle('active', el.dataset.theme === themeKey);
        });

        // Save preference
        localStorage.setItem(THEME_KEY, themeKey);
    }

    function initThemePicker() {
        const toggle = document.getElementById('theme-toggle');
        const panel = document.getElementById('theme-panel');
        if (!toggle || !panel) return;

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && e.target !== toggle) {
                panel.classList.remove('open');
            }
        });

        panel.querySelectorAll('.theme-option').forEach(el => {
            el.addEventListener('click', () => {
                applyTheme(el.dataset.theme);
                panel.classList.remove('open');
            });
        });

        // Load saved theme
        const saved = localStorage.getItem(THEME_KEY);
        if (saved && THEMES[saved]) {
            applyTheme(saved);
        }
    }

    /* ============================================
       9. TRAVEL CENTER (Announcements & Notes)
    ============================================ */
    const HOLIDAYS = [
        { date: 'Jan 1 - 4, 2026', name: 'New Year Long Weekend', type: 'Regular Holiday' },
        { date: 'Apr 2 - 5, 2026', name: 'Holy Week', type: 'Regular Holiday' },
        { date: 'Apr 9 - 12, 2026', name: 'Araw ng Kagitingan', type: 'Regular Holiday' },
        { date: 'May 1 - 3, 2026', name: 'Labor Day', type: 'Regular Holiday' },
        { date: 'Jun 12 - 14, 2026', name: 'Independence Day', type: 'Regular Holiday' },
        { date: 'Aug 21 - 23, 2026', name: 'Ninoy Aquino Day', type: 'Special Non-Working' },
        { date: 'Aug 29 - 31, 2026', name: 'National Heroes Day', type: 'Regular Holiday' },
        { date: 'Oct 31 - Nov 2, 2026', name: 'Undas Long Weekend', type: 'Special Non-Working' },
        { date: 'Nov 28 - 30, 2026', name: 'Bonifacio Day', type: 'Regular Holiday' },
        { date: 'Dec 24 - 27, 2026', name: 'Christmas Break', type: 'Regular Holiday' },
        { date: 'Dec 30 - Jan 3, 2027', name: 'Rizal Day & New Year', type: 'Regular Holiday' }
    ];

    let currentAnnIndex = 0;
    let annTimer = null;

    function initAnnouncements() {
        const content = document.getElementById('announcement-content');
        const dotsContainer = document.getElementById('ann-dots');
        const btnPrev = document.getElementById('ann-prev');
        const btnNext = document.getElementById('ann-next');
        if (!content) return;

        function renderAnn() {
            const h = HOLIDAYS[currentAnnIndex];
            content.style.opacity = 0;
            setTimeout(() => {
                content.innerHTML = `
                    <div class="ann-date">${h.date}</div>
                    <div class="ann-name">${h.name}</div>
                    <div class="ann-type">${h.type}</div>
                `;
                content.style.opacity = 1;
            }, 300);

            if (dotsContainer) {
                dotsContainer.innerHTML = '';
                HOLIDAYS.forEach((_, i) => {
                    const d = document.createElement('div');
                    d.className = `ann-dot ${i === currentAnnIndex ? 'active' : ''}`;
                    d.addEventListener('click', () => {
                        currentAnnIndex = i;
                        renderAnn();
                        resetAnnTimer();
                    });
                    dotsContainer.appendChild(d);
                });
            }
        }

        function nextAnn() {
            currentAnnIndex = (currentAnnIndex + 1) % HOLIDAYS.length;
            renderAnn();
        }
        function prevAnn() {
            currentAnnIndex = (currentAnnIndex - 1 + HOLIDAYS.length) % HOLIDAYS.length;
            renderAnn();
        }

        if (btnNext) btnNext.addEventListener('click', () => { nextAnn(); resetAnnTimer(); });
        if (btnPrev) btnPrev.addEventListener('click', () => { prevAnn(); resetAnnTimer(); });

        function resetAnnTimer() {
            clearInterval(annTimer);
            annTimer = setInterval(nextAnn, 5000);
        }

        renderAnn();
        resetAnnTimer();
    }

    function getCustomNotes() {
        if (!currentUser || currentUser.isGuest) {
            try { return JSON.parse(localStorage.getItem('LAKbay_GuestNotes')) || []; }
            catch { return []; }
        }
        const users = getAllUsers();
        return users[currentUser.key]?.customNotes || [];
    }

    function saveCustomNotes(notes) {
        if (!currentUser || currentUser.isGuest) {
            localStorage.setItem('LAKbay_GuestNotes', JSON.stringify(notes));
            return;
        }
        currentUser.customNotes = notes;
        const users = getAllUsers();
        if (users[currentUser.key]) {
            users[currentUser.key].customNotes = notes;
            saveAllUsers(users);
        }
        syncToCloud();
    }

    function getDaysDiff(targetDateStr, creationDateStr) {
        const target = new Date(targetDateStr);
        const now = new Date();
        target.setHours(0,0,0,0);
        now.setHours(0,0,0,0);
        
        const diffTime = target.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const creation = new Date(creationDateStr);
        creation.setHours(0,0,0,0);
        const daysSinceCreation = Math.floor((now.getTime() - creation.getTime()) / (1000 * 60 * 60 * 24));
        
        return { diffDays, daysSinceCreation };
    }

    let editNoteIndex = -1;

    function renderCustomNotes() {
        const list = document.getElementById('custom-notes-list');
        if (!list) return;

        const notes = getCustomNotes();
        list.innerHTML = '';

        if (notes.length === 0) {
            list.innerHTML = `<div class="no-notes">No travel notes yet. Add one!</div>`;
            return;
        }

        notes.sort((a, b) => new Date(a.date) - new Date(b.date));

        notes.forEach((n, i) => {
            const { diffDays, daysSinceCreation } = getDaysDiff(n.date, n.createdAt);
            let statusHtml = '';
            
            if (diffDays > 0) {
                statusHtml = `<div class="note-countdown"><span class="cnt-val">${diffDays}</span><span class="cnt-label">days left</span></div>`;
            } else if (diffDays === 0) {
                statusHtml = `<div class="note-countdown today"><span class="cnt-val">Today!</span><span class="cnt-label">🎉</span></div>`;
            } else {
                statusHtml = `<div class="note-countdown past"><span class="cnt-val">${Math.abs(diffDays)}</span><span class="cnt-label">days ago</span></div>`;
            }

            const el = document.createElement('div');
            el.className = 'custom-note-card';
            el.innerHTML = `
                <div class="note-card-main">
                    <div class="note-card-top">
                        <div class="note-title">${n.title}</div>
                        <div class="note-actions">
                            <button class="note-edit-btn" data-index="${i}" title="Edit">✎</button>
                            <button class="note-del-btn" data-index="${i}" title="Delete">×</button>
                        </div>
                    </div>
                    <div class="note-card-bottom">
                        <div class="note-date-txt">Target: ${new Date(n.date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}</div>
                        <div class="note-created-txt">Created ${daysSinceCreation === 0 ? 'today' : daysSinceCreation + ' days ago'}</div>
                    </div>
                </div>
                ${statusHtml}
            `;
            list.appendChild(el);
        });
    }

    function initCustomNotes() {
        const btnAdd = document.getElementById('btn-add-note');
        const overlay = document.getElementById('add-note-overlay');
        const btnCancel = document.getElementById('note-cancel');
        const btnSubmit = document.getElementById('note-submit');
        const titleInput = document.getElementById('note-title');
        const dateInput = document.getElementById('note-date');
        const errorMsg = document.getElementById('note-error');
        const list = document.getElementById('custom-notes-list');

        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                editNoteIndex = -1;
                titleInput.value = '';
                dateInput.value = '';
                if(errorMsg) errorMsg.textContent = '';
                overlay.querySelector('.auth-logo').innerHTML = 'New <span>Note</span>';
                overlay.style.display = 'flex';
            });
        }

        const btnEditDelete = document.getElementById('edit-delete-account');
        if (btnEditDelete) {
            btnEditDelete.addEventListener('click', async () => {
                if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                    // Delete from localStorage
                    const users = getAllUsers();
                    if (users[currentUser.key]) {
                        delete users[currentUser.key];
                        saveAllUsers(users);
                    }
                    // Delete from Firestore
                    if (firebaseReady && firebaseAuth.currentUser) {
                        try {
                            await firebaseDb.collection('users').doc(firebaseAuth.currentUser.uid).delete();
                        } catch (e) {
                            console.warn('Cloud delete failed:', e);
                        }
                    }
                    const overlay = document.getElementById('edit-profile-overlay');
                    if (overlay) overlay.style.display = 'none';
                    logout();
                    showToast('Account successfully deleted.', 'success');
                }
            });
        }

        if (list) {
            list.addEventListener('click', (e) => {
                const btnDel = e.target.closest('.note-del-btn');
                if (btnDel) {
                    const idx = parseInt(btnDel.dataset.index);
                    const currentNotes = getCustomNotes();
                    currentNotes.splice(idx, 1);
                    saveCustomNotes(currentNotes);
                    renderCustomNotes();
                    return;
                }
                
                const btnEdit = e.target.closest('.note-edit-btn');
                if (btnEdit) {
                    const idx = parseInt(btnEdit.dataset.index);
                    const currentNotes = getCustomNotes();
                    const note = currentNotes[idx];
                    
                    editNoteIndex = idx;
                    titleInput.value = note.title;
                    dateInput.value = note.date;
                    if (errorMsg) errorMsg.textContent = '';
                    overlay.querySelector('.auth-logo').innerHTML = 'Edit <span>Note</span>';
                    overlay.style.display = 'flex';
                }
            });
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                overlay.style.display = 'none';
            });
        }

        if (btnSubmit) {
            btnSubmit.addEventListener('click', () => {
                const title = titleInput.value.trim();
                const date = dateInput.value;
                if (!title || !date) {
                    if(errorMsg) errorMsg.textContent = 'Please provide both title and target date.';
                    return;
                }

                const notes = getCustomNotes();
                if (editNoteIndex >= 0) {
                    notes[editNoteIndex].title = title;
                    notes[editNoteIndex].date = date;
                } else {
                    notes.push({
                        id: Date.now(),
                        title,
                        date,
                        createdAt: new Date().toISOString()
                    });
                }
                saveCustomNotes(notes);
                overlay.style.display = 'none';
                renderCustomNotes();
                showToast(editNoteIndex >= 0 ? 'Note updated!' : 'Note added!', 'success');
            });
        }

        renderCustomNotes();
    }

    /* ============================================
       9b. BUCKET LIST MODULE
    ============================================ */
    const BUCKET_LIST_KEY = 'lakbaygabay_bucketlist';

    const BUCKET_ITEMS = [
        { id: 'whale-shark', text: 'Swim with whale sharks (Butanding)', location: 'Oslob, Cebu', emoji: '🐋' },
        { id: 'floating-cottage', text: 'Ride a floating cottage (Balsa)', location: 'Batangas', emoji: '🛶' },
        { id: 'kalesa-vigan', text: 'Ride a Kalesa in Calle Crisologo', location: 'Vigan, Ilocos Sur', emoji: '🐴' },
        { id: 'chocolate-hills', text: 'See the Chocolate Hills', location: 'Carmen, Bohol', emoji: '🏔️' },
        { id: 'tarsier', text: 'Meet a Philippine Tarsier up close', location: 'Loboc, Bohol', emoji: '🐒' },
        { id: 'underground-river', text: 'Explore the Underground River', location: 'Puerto Princesa, Palawan', emoji: '🕳️' },
        { id: 'elnido-island', text: 'Island hop in El Nido lagoons', location: 'El Nido, Palawan', emoji: '🏝️' },
        { id: 'surfing-siargao', text: 'Catch a wave at Cloud 9', location: 'General Luna, Siargao', emoji: '🏄' },
        { id: 'boracay-sunset', text: 'Watch the sunset at White Beach', location: 'Boracay, Aklan', emoji: '🌅' },
        { id: 'banaue-terraces', text: 'Trek the Banaue Rice Terraces', location: 'Banaue, Ifugao', emoji: '🌾' },
        { id: 'mayon-volcano', text: 'See the perfect cone of Mayon Volcano', location: 'Legazpi, Albay', emoji: '🌋' },
        { id: 'sardines-moalboal', text: 'Dive with millions of sardines', location: 'Moalboal, Cebu', emoji: '🐟' },
        { id: 'mt-pulag', text: 'Camp above the sea of clouds at Mt. Pulag', location: 'Benguet', emoji: '⛺' },
        { id: 'batanes-rolling', text: 'Walk the rolling hills of Batanes', location: 'Batanes', emoji: '🍃' },
        { id: 'magellans-cross', text: "Visit Magellan's Cross", location: 'Cebu City, Cebu', emoji: '✝️' },
        { id: 'san-juanico', text: 'Cross the San Juanico Bridge', location: 'Leyte – Samar', emoji: '🌉' },
        { id: 'kalanggaman', text: 'Step on the sandbar of Kalanggaman Island', location: 'Palompon, Leyte', emoji: '🏖️' },
        { id: 'coron-wrecks', text: 'Dive WWII Japanese shipwrecks', location: 'Coron, Palawan', emoji: '🤿' },
        { id: 'intramuros', text: 'Walk the walls of Intramuros', location: 'Manila, Metro Manila', emoji: '🏰' },
        { id: 'enchanted-river', text: 'Swim in the Enchanted River', location: 'Hinatuan, Surigao del Sur', emoji: '💎' },
        { id: 'lake-sebu', text: 'Ride the zipline over Lake Sebu', location: 'South Cotabato', emoji: '🪂' },
        { id: 'lechon-cebu', text: 'Eat authentic Cebu lechon', location: 'Cebu City, Cebu', emoji: '🍖' },
        { id: 'sinulog', text: 'Dance at the Sinulog Festival', location: 'Cebu City, Cebu', emoji: '💃' },
        { id: 'mt-apo', text: 'Summit Mt. Apo, the highest peak', location: 'Davao del Sur', emoji: '🗻' },
        { id: 'bangus-festival', text: 'Join the Bangus Festival', location: 'Dagupan, Pangasinan', emoji: '🐠' },
    ];

    function getBucketChecked() {
        if (!currentUser || currentUser.isGuest) {
            try { return JSON.parse(localStorage.getItem(BUCKET_LIST_KEY + '_guest')) || []; }
            catch { return []; }
        }
        const users = getAllUsers();
        return users[currentUser.key]?.bucketChecked || [];
    }

    function saveBucketChecked(checked) {
        if (!currentUser || currentUser.isGuest) {
            localStorage.setItem(BUCKET_LIST_KEY + '_guest', JSON.stringify(checked));
            return;
        }
        currentUser.bucketChecked = checked;
        const users = getAllUsers();
        if (users[currentUser.key]) {
            users[currentUser.key].bucketChecked = checked;
            saveAllUsers(users);
        }
        syncToCloud();
    }

    let bucketFilter = 'all';

    function renderBucketList() {
        const container = document.getElementById('bucket-list-items');
        if (!container) return;

        const checked = getBucketChecked();
        container.innerHTML = '';

        let visibleItems = BUCKET_ITEMS;
        if (bucketFilter === 'done') {
            visibleItems = BUCKET_ITEMS.filter(item => checked.includes(item.id));
        } else if (bucketFilter === 'pending') {
            visibleItems = BUCKET_ITEMS.filter(item => !checked.includes(item.id));
        }

        if (visibleItems.length === 0) {
            container.innerHTML = `<div class="no-notes" style="grid-column:1/-1">No items match this filter.</div>`;
        }

        visibleItems.forEach(item => {
            const isChecked = checked.includes(item.id);
            const el = document.createElement('div');
            el.className = `bucket-item${isChecked ? ' checked' : ''}`;
            el.dataset.id = item.id;
            el.innerHTML = `
                <div class="bucket-checkbox">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="bucket-item-content">
                    <div class="bucket-item-text">${item.text}</div>
                    <div class="bucket-item-location">📍 ${item.location}</div>
                </div>
                <div class="bucket-item-emoji">${item.emoji}</div>
            `;
            el.addEventListener('click', () => toggleBucketItem(item.id));
            container.appendChild(el);
        });

        // Update progress
        const doneCount = checked.length;
        const totalCount = BUCKET_ITEMS.length;
        const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        const doneEl = document.getElementById('bucket-done');
        const totalEl = document.getElementById('bucket-total');
        const fillEl = document.getElementById('bucket-progress-fill');
        if (doneEl) doneEl.textContent = doneCount;
        if (totalEl) totalEl.textContent = totalCount;
        if (fillEl) fillEl.style.width = pct + '%';
    }

    function toggleBucketItem(id) {
        const checked = getBucketChecked();
        const idx = checked.indexOf(id);
        if (idx >= 0) {
            checked.splice(idx, 1);
        } else {
            checked.push(id);
        }
        saveBucketChecked(checked);
        renderBucketList();
    }

    function initBucketList() {
        // Filter buttons
        document.querySelectorAll('.bucket-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.bucket-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                bucketFilter = btn.dataset.filter;
                renderBucketList();
            });
        });

        renderBucketList();
    }

    /* ============================================
       10. INITIALIZATION
    ============================================ */
    function init() {
        initCarousel();
        initMap();
        initAuth();
        initProfileEditor();
        initThemePicker();
        startPSTClock();
        initDownloadMenu();
        initResetModal();
        initAnnouncements();
        initCustomNotes();
        initBucketList();

        function setupPasswordToggle(inputId, btnId) {
            const input = document.getElementById(inputId);
            const btn = document.getElementById(btnId);
            if (input && btn) {
                btn.addEventListener('click', () => {
                    if (input.type === 'password') {
                        input.type = 'text';
                        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
                    } else {
                        input.type = 'password';
                        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                    }
                });
            }
        }
        setupPasswordToggle('auth-pin', 'toggle-auth-pin');
        setupPasswordToggle('edit-pin', 'toggle-edit-pin');

        document.getElementById('btn-save')?.addEventListener('click', manualSave);
        document.getElementById('btn-logout')?.addEventListener('click', logout);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LAKbay = { showToast, downloadPDF, manualSave, performReset, logout };

})();
