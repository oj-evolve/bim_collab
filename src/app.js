import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp, setDoc, writeBatch, getDocs } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyCPRWLcB9BODRYcZBkfCTBA7N78OQDhaKo",
    authDomain: "bim-collab.firebaseapp.com",
    projectId: "bim-collab",
    storageBucket: "bim-collab.appspot.com",
    messagingSenderId: "20536267192",
    appId: "1:20536267192:web:58510a149f6d36975bbf4d",
    measurementId: "G-Y6Z79DHLXK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storageService = getStorage(app);
const analytics = getAnalytics(app);

const projectStages = [
    { id: 's1', title: 'Briefing', sub: 'Initial Drawings & Concepts' },
    { id: 's2', title: 'Design Development', sub: 'Detailed Architectural Plans' },
    { id: 's3', title: 'Structural Planning', sub: 'Engineering Specs & Calcs' },
    { id: 's4', title: 'Cost Estimation', sub: 'Budget & Quantity Take-off' },
    { id: 's5', title: 'Final Drawing', sub: 'Approved Construction Docs' },
    { id: 's6', title: 'Construction Phase', sub: 'Building Execution & Monitoring' },
    { id: 's7', title: 'Completion', sub: 'Inspection & Handover' }
];

let currentRole = null;
let activeStageId = 's1';

const roleProfiles = {
    architect: { name: "Kelly de Boss", icon: "fa-pen-ruler" },
    engineer: { name: "Mike", icon: "fa-hard-hat" },
    contractor: { name: "John", icon: "fa-truck" },
    quantity: { name: "Emily", icon: "fa-calculator" },
    owner: { name: "David", icon: "fa-user-tie" }
};

const defaultRoleProfiles = {
    architect: { name: "Kelly de Boss", icon: "fa-pen-ruler" },
    engineer: { name: "Mike", icon: "fa-hard-hat" },
    contractor: { name: "John", icon: "fa-truck" },
    quantity: { name: "Emily", icon: "fa-calculator" },
    owner: { name: "David", icon: "fa-user-tie" }
};

const storage = {};
const archivedStorage = {};
const files = {};
const viewerStates = {};
const typingTimers = {};
const lastTypingUpdate = {};
const replyStates = {};
const activeUploads = {};
let lastSendTime = 0;
let cryptoKey = null;
let unreadCountC2 = 0;
let unreadCountC1 = 0;
let activeToolbar = null;
let sessionReadThresholds = {};
let initializationPromise = null;
let currentProjectName = "BIM COLLAB";
let currentProjectId = localStorage.getItem('bim_project_id') || 'default';
let showProjectOverview = false;

// Firebase Unsubscribe functions
let unsubscribeMessages = null;
let unsubscribeFiles = null;
let unsubscribeTyping = null;
let unsubscribeAllProfiles = null;
let unsubscribePinned = null;
let unsubscribeProjectSettings = null;
let unsubscribeProjectsList = null;

projectStages.forEach(s => {
    storage[s.id] = { c1: [], c2: [] };
    archivedStorage[s.id] = { c1: [], c2: [] };
    files[s.id] = { v1: [], v2: [] };
});

// Initialize immediately
setupFirebaseListeners(activeStageId);
setupGlobalProfileListener();
setupProjectSettingsListener();
setupProjectsListListener();
renderRoleSelectionPlaceholder();

window.initStages = function () {
    const list = document.getElementById('stageList');
    list.innerHTML = projectStages.map((s) => `
                <div class="stage ${s.id === activeStageId ? 'active' : ''}" id="nav-${s.id}" onclick="switchStage('${s.id}')">
                    <span class="stage-title">${s.title}</span>
                    <span class="stage-subtitle">${s.sub}</span>
                </div>
            `).join('');
}

window.switchStage = function (id) {
    activeStageId = id;
    sessionReadThresholds = {}; // Reset read thresholds on stage switch
    document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${id}`);
    if (activeNav) activeNav.classList.add('active');

    setupFirebaseListeners(id);

    if (currentRole) renderWorkspace();
}

function setupFirebaseListeners(stageId) {
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeFiles) unsubscribeFiles();
    if (unsubscribeTyping) unsubscribeTyping();
    if (unsubscribePinned) unsubscribePinned();

    let isInitialLoad = true;

    // Listen for Messages
    const qMsg = query(collection(db, "messages"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
    unsubscribeMessages = onSnapshot(qMsg, (snapshot) => {
        if (!isInitialLoad && currentRole) {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const d = change.doc.data();
                    if (d.user !== currentRole) {
                        if (!document.hasFocus()) playNotificationSound();
                        const grid = document.getElementById('dashboardGrid');

                        if (d.chatId === 'c2') {
                            const badge = document.getElementById('badge-group-2');
                            if (grid && !grid.classList.contains('view-secondary') && badge) {
                                unreadCountC2++;
                                badge.textContent = unreadCountC2 > 99 ? '99+' : unreadCountC2;
                                badge.classList.add('active');
                            }
                            if (grid && !grid.classList.contains('view-secondary')) {
                                const notif = document.getElementById('notif-right');
                                if (notif) notif.style.display = 'block';
                            }
                        }
                        if (d.chatId === 'c1') {
                            const badge = document.getElementById('badge-group-1');
                            if (grid && grid.classList.contains('view-secondary') && badge) {
                                unreadCountC1++;
                                badge.textContent = unreadCountC1 > 99 ? '99+' : unreadCountC1;
                                badge.classList.add('active');
                            }
                            if (grid && grid.classList.contains('view-secondary')) {
                                const notif = document.getElementById('notif-left');
                                if (notif) notif.style.display = 'block';
                            }
                        }
                    }
                }
            });
        }
        isInitialLoad = false;

        // Reset local cache for this stage
        storage[stageId] = { c1: [], c2: [] };
        archivedStorage[stageId] = { c1: [], c2: [] };
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.archived) {
                if (archivedStorage[stageId][data.chatId]) {
                    archivedStorage[stageId][data.chatId].push({
                        id: doc.id,
                        ...data,
                        time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'
                    });
                }
                return;
            }
            if (storage[stageId][data.chatId]) {
                storage[stageId][data.chatId].push({
                    id: doc.id, // Store doc ID for deletion/editing
                    ...data,
                    time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'
                });
            }
        });
        loadStageData();

        // Update archive modal if open
        const archiveModal = document.getElementById('archived-messages-modal');
        if (archiveModal && archiveModal.dataset.chatId) {
            renderArchivedMessagesList(archiveModal.dataset.chatId);
        }
    }, (error) => {
        console.error("Error listening to messages:", error);
        if (error.code === 'permission-denied') console.warn("Ensure Firestore Rules are deployed.");
    });

    // Listen for Files
    const qFiles = query(collection(db, "files"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
    unsubscribeFiles = onSnapshot(qFiles, (snapshot) => {
        files[stageId] = { v1: [], v2: [] };
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (files[stageId][data.viewId]) {
                files[stageId][data.viewId].push({
                    id: doc.id,
                    ...data,
                    date: data.timestamp ? data.timestamp.toDate() : new Date()
                });
            }
        });
        loadStageData();
    }, (error) => {
        console.error("Error listening to files:", error);
        if (error.code === 'permission-denied') console.warn("Ensure Firestore Rules are deployed.");
    });

    // Listen for Typing Status
    const qTyping = query(collection(db, "typing"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId), where("isTyping", "==", true));
    unsubscribeTyping = onSnapshot(qTyping, (snapshot) => {
        const typingMap = {};
        snapshot.docs.forEach(doc => {
            const d = doc.data();
            if (d.user !== currentRole) {
                if (!typingMap[d.chatId]) typingMap[d.chatId] = [];
                const name = roleProfiles[d.user] ? roleProfiles[d.user].name : d.user;
                if (!typingMap[d.chatId].includes(name)) typingMap[d.chatId].push(name);
            }
        });

        ['c1', 'c2'].forEach(cid => {
            const el = document.getElementById(`typing-${cid}`);
            if (el) {
                const names = typingMap[cid] || [];
                el.textContent = names.length > 0 ? `${names.join(', ')} is typing...` : '';
            }
        });
    });

    // Listen for Pinned Messages
    const qPinned = query(collection(db, "pinned_messages"), where("projectId", "==", currentProjectId), where("stageId", "==", stageId));
    unsubscribePinned = onSnapshot(qPinned, (snapshot) => {
        ['c1', 'c2'].forEach(cid => {
             const el = document.getElementById(`pinned-message-${cid}`);
             if(el) el.style.display = 'none';
        });

        snapshot.docs.forEach(async doc => {
            const data = doc.data();
            const el = document.getElementById(`pinned-message-${data.chatId}`);
            const contentEl = document.getElementById(`pinned-content-${data.chatId}`);
            if (el && contentEl) {
                let text = data.text;
                if (data.isEncrypted) {
                    text = await decryptData(data.text);
                }
                contentEl.innerHTML = `<i class="fas fa-thumbtack" style="margin-right:6px; font-size:0.7rem; color:var(--primary)"></i> <span style="font-size:0.75rem; font-weight:500">${escapeHtml(text)}</span>`;
                el.style.display = 'flex';
            }
        });
    });
}

function setupGlobalProfileListener() {
    const q = collection(db, "projects", currentProjectId, "profiles");
    unsubscribeAllProfiles = onSnapshot(q, (snapshot) => {
        snapshot.docs.forEach(doc => {
            const role = doc.id;
            const data = doc.data();
            if (roleProfiles[role]) {
                if (data.name) roleProfiles[role].name = data.name;
                if (data.status) roleProfiles[role].status = data.status;
                if (data.muteNotifications !== undefined) roleProfiles[role].muteNotifications = data.muteNotifications;
                if (data.theme) roleProfiles[role].theme = data.theme;
                else if (data.darkMode !== undefined) roleProfiles[role].theme = data.darkMode ? 'dark' : 'light';
            }
            if (currentRole && role === currentRole) {
                updateDashboardTitleAndSidebar();
                // Apply dark mode setting immediately
                if (roleProfiles[role].theme) {
                    applyTheme(roleProfiles[role].theme);
                }
            }
        });
        loadStageData();
    });
}

function setupProjectSettingsListener() {
    if (unsubscribeProjectSettings) unsubscribeProjectSettings();
    unsubscribeProjectSettings = onSnapshot(doc(db, "projects", currentProjectId), (docSnapshot) => {
        // Ensure App Name is fixed
        const logoText = document.querySelector('.logo span');
        if (logoText) logoText.textContent = "BIM COLLAB";

        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            if (data.name) {
                currentProjectName = data.name;
                const projectText = document.getElementById('headerProjectName');
                if (projectText) projectText.textContent = data.name;
                document.title = `BIM COLLAB - ${data.name}`;
            }
        } else if (currentProjectId === 'default') {
            currentProjectName = "Default Project";
            const projectText = document.getElementById('headerProjectName');
            if (projectText) projectText.textContent = currentProjectName;
            document.title = "BIM COLLAB";
        }
    });
}

function updateDashboardTitleAndSidebar() {
    const titleEl = document.getElementById('dashboardTitle');
    const headerEl = document.getElementById('dashboardHeader');
    const welcomeEl = document.getElementById('welcomeMsg');
    
    if (headerEl) headerEl.style.display = 'block';

    if (titleEl && roleProfiles[currentRole]) {
        const name = roleProfiles[currentRole].name;
        let displayTitle = name;
        if (currentRole === 'architect') displayTitle = `Arch ${name}`;
        else if (currentRole === 'engineer') displayTitle = `Eng ${name}`;
        else if (currentRole === 'quantity') displayTitle = `Svy ${name}`;
        else if (currentRole === 'contractor') displayTitle = `Contractor ${name}`;
        else if (currentRole === 'owner') displayTitle = `Owner ${name}`;
        
        titleEl.textContent = displayTitle;
        if (welcomeEl) welcomeEl.textContent = "Welcome back,";
    }

    const sidebarRole = document.getElementById('sidebarRoleDisplay');
    const sidebarName = document.getElementById('profileNameDisplay');

    if (sidebarRole) sidebarRole.textContent = currentRole;
    if (roleProfiles[currentRole]) {
        if (sidebarName) sidebarName.textContent = roleProfiles[currentRole].name;
    }

    const avatarEl = document.getElementById('userAvatar');
    const initialsEl = document.getElementById('avatarInitials');
    if (avatarEl && initialsEl && roleProfiles[currentRole]) {
        const name = roleProfiles[currentRole].name;
        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        initialsEl.textContent = initials;
        avatarEl.style.display = 'flex';

        const statusEl = document.getElementById('statusIndicator');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.className = 'status-indicator ' + (roleProfiles[currentRole].status || 'online');
        }
    }

    const projectText = document.getElementById('headerProjectName');
    if (projectText) {
        projectText.style.display = currentRole === 'owner' ? 'block' : 'none';
    }
}

document.getElementById('roleSelect').onchange = (e) => {
    currentRole = e.target.value;
    sessionReadThresholds = {}; // Reset read thresholds on role change
    
    updateDashboardTitleAndSidebar();

    renderWorkspace();
};

window.logout = function (confirmed = false) {
    if (!confirmed) {
        openLogoutConfirmationModal();
        return;
    }

    const modal = document.getElementById('logout-confirm-modal');
    if (modal) modal.remove();

    currentRole = null;
    document.getElementById('roleSelect').value = "";

    const sidebarRole = document.getElementById('sidebarRoleDisplay');
    const sidebarName = document.getElementById('profileNameDisplay');

    if (sidebarRole) sidebarRole.textContent = "No Role Selected";
    if (sidebarName) sidebarName.textContent = "Guest User";

    const titleEl = document.getElementById('dashboardTitle');
    const headerEl = document.getElementById('dashboardHeader');
    const welcomeEl = document.getElementById('welcomeMsg');
    if (titleEl) titleEl.textContent = "Dashboard";
    if (headerEl) headerEl.style.display = 'none';
    if (welcomeEl) welcomeEl.textContent = "";

    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) avatarEl.style.display = 'none';

    const statusEl = document.getElementById('statusIndicator');
    if (statusEl) statusEl.style.display = 'none';

    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');
    document.body.classList.remove('dark-mode'); // Reset to light mode on logout

    const projectText = document.getElementById('headerProjectName');
    if (projectText) projectText.style.display = 'none';

    renderRoleSelectionPlaceholder();

    // Close sidebar if open
    const mobileSidebar = document.getElementById('mobileSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (mobileSidebar) mobileSidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
};

function renderRoleSelectionPlaceholder() {
    const panel = document.getElementById('workspaceContent') || document.getElementById('mainPanel');
    panel.innerHTML = `
                <div class="card">
                    <div class="placeholder-box">
                        <i class="fas fa-layer-group fa-4x placeholder-icon"></i>
                        <h3>Welcome to the Project Hub</h3>
                        <p class="placeholder-text">Select your role to initialize your specific workspace.</p>
                    </div>
                </div>
            `;
}

window.renderWorkspace = function () {
    const panel = document.getElementById('workspaceContent') || document.getElementById('mainPanel');

    if (currentRole === 'owner' && showProjectOverview) {
        renderProjectOverview(panel);
        return;
    }

    unreadCountC2 = 0;
    unreadCountC1 = 0;

    const notifLeft = document.getElementById('notif-left');
    const notifRight = document.getElementById('notif-right');
    if (notifLeft) notifLeft.style.display = 'none';
    if (notifRight) notifRight.style.display = 'none';

    const toggle = document.getElementById('viewToggle');
    if (toggle) toggle.style.display = ''; // Reset to default (CSS handles mobile/desktop)

    // Engineer and Contractor see a restricted UI
    const isRestricted = (currentRole === 'engineer' || currentRole === 'contractor');

    let projectsBtn = '';
    if (currentRole === 'owner') {
        projectsBtn = `<button onclick="toggleProjectOverview()" style="margin-bottom: 1rem; padding: 0.5rem 1rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; color: var(--primary); font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem;"><i class="fas fa-th-large"></i> View All Projects</button>`;
    }

    if (isRestricted) {
        panel.innerHTML = `
                    <div class="dashboard-grid grid-1-only">
                        ${viewerNode('v1', 'Project View')}
                        ${chatNode('c1', 'Main Stream', 'v1')}
                    </div>
                `;
        if (toggle) toggle.style.display = 'none'; // Hide toggle for restricted roles
    } else {
        panel.innerHTML = `
                    ${projectsBtn}
                    <div class="dashboard-grid grid-workspace" id="dashboardGrid">
                        ${viewerNode('v1', 'Project View', 'mobile-group-1')}
                        ${chatNode('c1', 'Main Stream', 'v1', 'mobile-group-1')}
                        ${viewerNode('v2', 'Secondary View', 'mobile-group-2')}
                        ${chatNode('c2', 'Private Channel', 'v2', 'mobile-group-2')}
                    </div>
                `;
    }
    setupSwipeGestures();
    loadStageData();
}

window.viewerNode = function (id, title, extraClass = '') {
    if (!viewerStates[id]) viewerStates[id] = { zoom: 1, rot: 0 };

    let toolbarStyle = "";

    return `
                <div class="card ${extraClass}">
                    <div class="card-header">
                        <span class="card-title">${title}</span>
                        <span style="font-size:0.6rem; opacity:0.5">${activeStageId.toUpperCase()}</span>
                    </div>
                    <div class="viewer-container" id="viewer-container-${id}" style="position:relative; overflow:hidden;">
                        <div class="viewer-content-wrapper" id="wrapper-${id}">
                            <span style="color:rgba(255,255,255,0.2); font-size:0.7rem">No data for this stage</span>
                        </div>
                        <div class="viewer-toolbar" id="toolbar-${id}" style="${toolbarStyle}">
                            <button class="tool-btn" title="Zoom In" onclick="zoom('${id}', 0.2)"><i class="fas fa-plus"></i></button>
                            <button class="tool-btn" title="Zoom Out" onclick="zoom('${id}', -0.2)"><i class="fas fa-minus"></i></button>
                            <button class="tool-btn" title="Rotate" onclick="rotate('${id}')"><i class="fas fa-sync"></i></button>
                            <button class="tool-btn" title="Reset View" onclick="resetViewer('${id}')"><i class="fas fa-undo"></i></button>
                            <button class="tool-btn" id="orbit-btn-${id}" title="Toggle Orbit" onclick="toggleOrbit('${id}')" style="display:none"><i class="fas fa-cube"></i></button>
                            <input type="range" id="vol-${id}" title="Volume" min="0" max="1" step="0.1" value="1" style="width:50px; display:none; vertical-align:middle; cursor:pointer; margin: 0 2px;" oninput="setVolume('${id}', this.value)">
                            <button class="tool-btn" title="Download All" onclick="downloadAll('${id}')"><i class="fas fa-download"></i></button>
                            <button class="tool-btn" title="Toggle Fullscreen" onclick="toggleFullscreen('${id}')"><i class="fas fa-expand"></i></button>
                        </div>
                    </div>
                    <div class="viewer-thumbs" id="thumbs-${id}" style="display:flex; overflow-x:auto; gap:5px; padding:5px;"></div>
                </div>
            `;
}

window.chatNode = function (id, title, vId, extraClass = '') {
    const currentStageObj = projectStages.find(s => s.id === activeStageId);
    const stageName = currentStageObj ? currentStageObj.title : activeStageId;

    const emojis = ['👍', '👎', '😀', '😂', '😍', '🎉', '🔥', '❤️', '✅', '❌', '🤔', '😎', '😭', '👀', '🚀', '🏗️', '🏠', '👷'];
    const emojiHtml = emojis.map(e => `<span style="cursor:pointer; font-size:1.2rem; padding:4px; user-select:none;" onclick="insertEmoji('${id}', '${e}')">${e}</span>`).join('');

    let ownerControls = '';
    if (currentRole === 'owner') {
        ownerControls = `
            <button onclick="openArchivedMessagesModal('${id}')" title="View Archived" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-right:5px;" onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-muted)'"><i class="fas fa-history"></i></button>
            <button onclick="openArchiveChatModal('${id}')" title="Archive Chat" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'"><i class="fas fa-archive"></i></button>
        `;
    }

    return `
                <div class="card ${extraClass}" ondragover="handleDragOver(event)" ondragenter="highlight(event)" ondragleave="unhighlight(event)" ondrop="handleDrop(event, '${id}', '${vId}')">
                    <div class="card-header">
                        <div style="flex:1; display:flex; flex-direction:column; overflow:hidden; margin-right:0.5rem;">
                            <div style="display:flex; align-items:center; overflow:hidden;">
                                <span class="card-title" style="flex:0 1 auto; margin-right:0;">${title}</span>
                                <span id="file-count-${id}" onclick="viewAllFiles('${id}', '${vId}')" style="cursor:pointer; font-size:0.6rem; background:var(--primary); color:white; padding:1px 6px; border-radius:10px; margin-left:6px; vertical-align:middle; display:none"></span>
                            </div>
                            <span id="typing-${id}" style="font-size:0.65rem; color:var(--primary); font-style:italic; min-height:14px; line-height:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
                        </div>
                        <div style="display:flex; align-items:center; gap:5px;">
                            <div class="search-wrapper" id="search-wrapper-${id}">
                                <i class="fas fa-search search-toggle-icon" onclick="toggleSearch('${id}')" title="Search"></i>
                                <input type="text" id="search-${id}" placeholder="Search..." class="search-input" oninput="handleSearchInput('${id}')" onblur="checkSearchBlur('${id}')">
                                <i id="search-clear-${id}" class="fas fa-times search-clear-btn" onclick="clearSearch('${id}')"></i>
                            </div>
                            ${ownerControls}
                        </div>
                    </div>
                    <div id="pinned-message-${id}" class="pinned-message-banner" style="display:none">
                        <div id="pinned-content-${id}" class="pinned-message-content" style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:1rem;"></div>
                        <i class="fas fa-times" style="cursor:pointer; opacity:0.6; font-size:0.8rem" onclick="unpinMessage('${id}')" title="Unpin"></i>
                    </div>
                    <div class="chat-container" id="chat-box-${id}"></div>
                    <div id="reply-preview-${id}" style="font-size: 0.7rem; color: var(--primary); padding-left: 10px; display:none; margin-bottom: 5px;"></div>
                    <div id="progress-container-${id}" style="display:none; padding: 0 10px; margin-bottom: 5px; align-items: center;">
                        <div style="flex: 1; height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
                            <div id="progress-bar-${id}" style="height: 100%; width: 0%; background: var(--primary); transition: width 0.1s;"></div>
                        </div>
                        <i class="fas fa-times-circle" style="margin-left: 8px; cursor: pointer; color: #dc3545; font-size: 0.9rem;" onclick="cancelUpload('${id}')" title="Cancel Upload"></i>
                    </div>
                    <div class="chat-input-area" style="position:relative">
                        <div id="emoji-picker-${id}" style="display:none; position:absolute; bottom:100%; left:0; background:#fff; border:1px solid #ccc; padding:8px; border-radius:4px; width:220px; flex-wrap:wrap; gap:4px; max-height:150px; overflow-y:auto; box-shadow: 0 -4px 12px rgba(0,0,0,0.15); z-index:100; margin-bottom: 8px;">
                            ${emojiHtml}
                        </div>
                        <label style="cursor:pointer; color:var(--primary); margin-right: 8px;" title="Attach File">
                            <i class="fas fa-paperclip"></i>
                            <input type="file" multiple style="display:none" onchange="handleFile('${id}', '${vId}', this)">
                        </label>
                        <button onclick="toggleEmojiPicker('${id}')" style="background:none; border:none; cursor:pointer; color:var(--primary); margin-right:8px; font-size: 1.1rem;" title="Add Emoji">
                            <i class="far fa-smile"></i>
                        </button>
                        <input type="text" id="input-${id}" placeholder="Type a message..." style="height: 36px; font-size: 0.85rem;" oninput="handleTyping('${id}')" onkeypress="if(event.key==='Enter') send('${id}')">
                        <button onclick="send('${id}')" class="send-btn" title="Send Message"><i class="fas fa-paper-plane"></i></button>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 0.25rem;"><i class="fas fa-lock" style="margin-right: 4px;"></i>End-to-End Encrypted</div>
                </div>
            `;
}

window.toggleSearch = function(chatId) {
    const wrapper = document.getElementById(`search-wrapper-${chatId}`);
    const input = document.getElementById(`search-${chatId}`);
    if (wrapper && input) {
        wrapper.classList.add('expanded');
        input.focus();
    }
}

window.checkSearchBlur = function(chatId) {
    setTimeout(() => {
        const wrapper = document.getElementById(`search-wrapper-${chatId}`);
        const input = document.getElementById(`search-${chatId}`);
        if (wrapper && input && !input.value && document.activeElement !== input) {
            wrapper.classList.remove('expanded');
        }
    }, 200);
}

window.handleSearchInput = function(chatId) {
    const input = document.getElementById(`search-${chatId}`);
    const clearBtn = document.getElementById(`search-clear-${chatId}`);
    if (clearBtn && input) {
        clearBtn.style.display = input.value ? 'block' : 'none';
    }
    loadStageData();
}

window.clearSearch = function(chatId) {
    const input = document.getElementById(`search-${chatId}`);
    if (input) {
        input.value = '';
        handleSearchInput(chatId);
        input.focus(); // Keep focus to prevent collapse
    }
}

window.loadStageData = async function () {
    for (const chatId of ['c1', 'c2']) {
        const box = document.getElementById(`chat-box-${chatId}`);
        if (!box) return;

        const vId = chatId.replace('c', 'v');
        const fCount = (files[activeStageId][vId] || []).length;
        const badge = document.getElementById(`file-count-${chatId}`);
        if (badge) {
            badge.textContent = fCount;
            badge.style.display = fCount > 0 ? 'inline-block' : 'none';
            badge.title = `${fCount} file${fCount === 1 ? '' : 's'} shared`;
        }

        const searchInput = document.getElementById(`search-${chatId}`);
        const term = searchInput ? searchInput.value.toLowerCase() : '';

        box.innerHTML = '';

        const messages = storage[activeStageId][chatId];
        let hasResults = false;

        // Determine the read threshold for this session
        const storageKey = `bim_last_read_${currentRole}_${activeStageId}_${chatId}`;
        const sessionKey = `${activeStageId}_${chatId}`;
        if (!sessionReadThresholds[sessionKey]) {
            const stored = localStorage.getItem(storageKey);
            sessionReadThresholds[sessionKey] = stored ? parseInt(stored) : Date.now();
        }
        const threshold = sessionReadThresholds[sessionKey];
        let dividerInserted = false;

        for (let i = 0; i < messages.length; i++) {
            const m = messages[i];
            let displayText = m.text;
            if (m.isEncrypted) displayText = await decryptData(m.text);

            if (term && !displayText.toLowerCase().includes(term) && !m.user.toLowerCase().includes(term)) continue;
            hasResults = true;

            // Check if we need to insert the "Unread" divider
            if (!dividerInserted && !term) {
                let msgTime = 0;
                if (m.timestamp) {
                    if (typeof m.timestamp.toMillis === 'function') msgTime = m.timestamp.toMillis();
                    else if (m.timestamp.seconds) msgTime = m.timestamp.seconds * 1000;
                    else if (m.timestamp instanceof Date) msgTime = m.timestamp.getTime();
                } else {
                    msgTime = Date.now(); // Handle pending writes
                }

                if (msgTime > threshold && m.user !== currentRole) {
                    const divider = document.createElement('div');
                    divider.className = 'unread-divider';
                    divider.innerHTML = '<span>Unread Messages</span>';
                    box.appendChild(divider);
                    dividerInserted = true;

                    setTimeout(() => {
                        if (divider.isConnected) {
                            divider.style.transition = 'opacity 0.5s';
                            divider.style.opacity = '0';
                            setTimeout(() => divider.remove(), 500);
                        }
                    }, 3000);
                }
            }

            const msgDiv = document.createElement('div');
            msgDiv.className = 'message';
            if (m.user === currentRole) msgDiv.classList.add('own-message');

            // Long press / Context Menu for Mobile Toolbar
            let touchTimer;
            let touchStartX, touchStartY;

            msgDiv.addEventListener('touchstart', (e) => {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchTimer = setTimeout(() => {
                    showMessageToolbar(chatId, m.id, i, msgDiv, m.user === currentRole);
                    if (navigator.vibrate) navigator.vibrate(50);
                }, 600);
            }, {passive: true});
            msgDiv.addEventListener('touchend', () => clearTimeout(touchTimer));
            msgDiv.addEventListener('touchmove', (e) => {
                const diffX = Math.abs(e.touches[0].clientX - touchStartX);
                const diffY = Math.abs(e.touches[0].clientY - touchStartY);
                if (diffX > 10 || diffY > 10) clearTimeout(touchTimer);
            }, {passive: true});
            msgDiv.oncontextmenu = (e) => {
                e.preventDefault();
                showMessageToolbar(chatId, m.id, i, msgDiv, m.user === currentRole);
                return false;
            };

            if (m.replyTo) {
                const replyContext = document.createElement('div');
                replyContext.style.fontSize = '0.7rem';
                replyContext.style.color = '#888';
                replyContext.style.borderLeft = '2px solid var(--primary)';
                replyContext.style.paddingLeft = '5px';
                replyContext.style.marginBottom = '2px';
                replyContext.textContent = `Replying to ${m.replyTo.user}: ${m.replyTo.text.substring(0, 30)}${m.replyTo.text.length > 30 ? '...' : ''}`;
                msgDiv.appendChild(replyContext);
            }

            const userStrong = document.createElement('strong');
            userStrong.textContent = m.user.toUpperCase();
            msgDiv.appendChild(userStrong);
            
            msgDiv.appendChild(document.createTextNode(': '));

            if (term) {
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = displayText.split(regex);
                parts.forEach(part => {
                    if (part.toLowerCase() === term) {
                        const mark = document.createElement('span');
                        mark.className = 'search-highlight';
                        mark.textContent = part;
                        msgDiv.appendChild(mark);
                    } else {
                        msgDiv.appendChild(document.createTextNode(part));
                    }
                });
            } else {
                msgDiv.appendChild(document.createTextNode(displayText));
            }

            if (m.time) {
                const timeDiv = document.createElement('div');
                timeDiv.style.fontSize = '0.65rem';
                timeDiv.style.opacity = '0.5';
                timeDiv.style.marginTop = '4px';
                timeDiv.textContent = m.time;
                if (m.edited) {
                    const editedSpan = document.createElement('span');
                    editedSpan.textContent = ' (edited)';
                    editedSpan.style.fontStyle = 'italic';
                    timeDiv.appendChild(editedSpan);
                }
                msgDiv.appendChild(timeDiv);
            }

            box.appendChild(msgDiv);
        }

        if (term && !hasResults) {
            const noResults = document.createElement('div');
            noResults.style.cssText = 'text-align:center; padding:2rem; color:var(--text-muted); font-size:0.85rem; display:flex; flex-direction:column; align-items:center; opacity:0.7';
            noResults.innerHTML = '<i class="fas fa-search" style="font-size:1.5rem; margin-bottom:0.5rem"></i>No results found';
            box.appendChild(noResults);
        }

        // Update the persistent last read time to now (so they are marked read for next session)
        localStorage.setItem(storageKey, Date.now().toString());

        box.scrollTop = box.scrollHeight;
    }

    ['v1', 'v2'].forEach(vId => {
        const thumbs = document.getElementById(`thumbs-${vId}`);
        const stageFiles = files[activeStageId][vId];
        if (stageFiles && thumbs && stageFiles.length > 0) {
            thumbs.innerHTML = stageFiles.map((f, i) => {
                const isImg = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(f.name);
                const isCad = /\.(dwg|dxf)$/i.test(f.name);
                const isDoc = /\.(doc|docx|xls|xlsx|ppt|pptx|csv)$/i.test(f.name);
                const icon = isCad ? 'fa-layer-group' : (isDoc ? 'fa-file-alt' : 'fa-file');
                const thumbContent = isImg ? `<img src="${f.url}">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#888;"><i class="fas ${icon}"></i></div>`;
                const safeName = f.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<div class="viewer-thumb" onclick="setViewer('${vId}', '${f.url}', '${safeName}')" style="flex:0 0 auto;">${thumbContent}</div>`;
            }).join('');
            const last = stageFiles[stageFiles.length - 1];
            setViewer(vId, last.url, last.name);
        }
    });
}

window.showMessageToolbar = function(chatId, msgId, index, element, isOwn) {
    if (activeToolbar) window.closeMessageToolbar();

    element.classList.add('highlighted');

    const toolbar = document.createElement('div');
    toolbar.className = 'message-options-toolbar';
    
    // Quick Emojis (React/Reply)
    const emojis = ['👍', '❤️', '😂'];
    emojis.forEach(e => {
        const span = document.createElement('span');
        span.className = 'option-btn';
        span.textContent = e;
        span.onclick = (ev) => {
            ev.stopPropagation();
            // Quick reply with emoji
            window.replyMessage(chatId, index);
            const input = document.getElementById(`input-${chatId}`);
            if(input) {
                input.value = e;
                window.send(chatId);
            }
            window.closeMessageToolbar();
        };
        toolbar.appendChild(span);
    });

    // Reply Icon
    const replyBtn = document.createElement('i');
    replyBtn.className = 'fas fa-reply option-btn';
    replyBtn.style.marginLeft = '8px';
    replyBtn.onclick = (ev) => {
        ev.stopPropagation();
        window.replyMessage(chatId, index);
        window.closeMessageToolbar();
    };
    toolbar.appendChild(replyBtn);

    // Copy Icon
    const copyBtn = document.createElement('i');
    copyBtn.className = 'fas fa-copy option-btn';
    copyBtn.style.marginLeft = '8px';
    copyBtn.onclick = async (ev) => {
        ev.stopPropagation();
        const msg = storage[activeStageId][chatId][index];
        if (msg) {
            let text = msg.text;
            if (msg.isEncrypted) text = await decryptData(msg.text);
            navigator.clipboard.writeText(text).catch(err => console.error('Copy failed', err));
        }
        window.closeMessageToolbar();
    };
    toolbar.appendChild(copyBtn);

    // Delete Icon (only if own message)
    if (isOwn) {
        const editBtn = document.createElement('i');
        editBtn.className = 'fas fa-edit option-btn';
        editBtn.style.marginLeft = '8px';
        editBtn.onclick = (ev) => {
            ev.stopPropagation();
            window.editMessage(chatId, msgId, index);
            window.closeMessageToolbar();
        };
        toolbar.appendChild(editBtn);

        const delBtn = document.createElement('i');
        delBtn.className = 'fas fa-trash option-btn';
        delBtn.style.color = '#ef4444';
        delBtn.style.marginLeft = '8px';
        delBtn.onclick = (ev) => {
            ev.stopPropagation();
            window.deleteMessage(chatId, msgId);
            window.closeMessageToolbar();
        };
        toolbar.appendChild(delBtn);
    }

    document.body.appendChild(toolbar);
    activeToolbar = { element, toolbar };

    // Position toolbar above the message
    const rect = element.getBoundingClientRect();
    toolbar.style.top = `${rect.top - 55 + window.scrollY}px`;
    toolbar.style.left = `${rect.left + (rect.width / 2)}px`;

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', window.closeMessageToolbar, { once: true });
        document.addEventListener('scroll', window.closeMessageToolbar, { once: true });
    }, 10);
}

window.closeMessageToolbar = function() {
    if (activeToolbar) {
        if (activeToolbar.element) activeToolbar.element.classList.remove('highlighted');
        if (activeToolbar.toolbar) activeToolbar.toolbar.remove();
        activeToolbar = null;
    }
}

window.switchMobileGroup = function(group) {
    const grid = document.getElementById('dashboardGrid');
    const toggle = document.getElementById('viewToggle');
    
    if (group === 'group-2') {
        grid.classList.add('view-secondary');
        if (toggle) toggle.classList.add('active');

        const badge = document.getElementById('badge-group-2');
        if (badge) badge.classList.remove('active');
        if (badge) {
            badge.classList.remove('active');
            badge.textContent = '';
        }
        unreadCountC2 = 0;
        const notif = document.getElementById('notif-right');
        if (notif) notif.style.display = 'none';
    } else {
        grid.classList.remove('view-secondary');
        if (toggle) toggle.classList.remove('active');

        const badge = document.getElementById('badge-group-1');
        if (badge) {
            badge.classList.remove('active');
            badge.textContent = '';
        }
        unreadCountC1 = 0;
        const notif = document.getElementById('notif-left');
        if (notif) notif.style.display = 'none';
    }
}

function setupSwipeGestures() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;

    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0;
    let touchEndY = 0;

    grid.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    grid.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe(e);
    }, { passive: true });

    function handleSwipe(e) {
        if (window.innerWidth > 767) return;
        
        // Avoid conflict with viewer interactions (pan/zoom/rotate) and scrollable thumbs
        if (e.target.closest('.viewer-container') || e.target.closest('.viewer-thumbs')) return;

        const xDiff = touchStartX - touchEndX;
        const yDiff = touchStartY - touchEndY;

        // Ensure it's mostly horizontal swipe
        if (Math.abs(xDiff) > Math.abs(yDiff) && Math.abs(xDiff) > 50) {
            if (xDiff > 0) switchMobileGroup('group-2'); // Swipe Left
            else switchMobileGroup('group-1'); // Swipe Right
        }
    }
}

window.send = async function (chatId) {
    const now = Date.now();
    if (now - lastSendTime < 500) {
        return;
    }
    lastSendTime = now;

    const input = document.getElementById(`input-${chatId}`);
    const textToSend = input.value;
    if (!textToSend.trim()) return;

    input.value = "";
    input.focus();

    const encryptedText = await encryptData(textToSend);
    const msg = {
        user: currentRole,
        projectId: currentProjectId,
        text: encryptedText,
        isEncrypted: true,
        stageId: activeStageId,
        chatId: chatId,
        timestamp: serverTimestamp()
    };
    if (replyStates[chatId]) {
        msg.replyTo = replyStates[chatId];
        cancelReply(chatId);
    }

    await addDoc(collection(db, "messages"), msg);

    const typingEl = document.getElementById(`typing-${chatId}`);
    if (typingEl) typingEl.textContent = '';
    if (typingTimers[chatId]) clearTimeout(typingTimers[chatId]);
}

window.deleteMessage = async function (chatId, msgId) {
    if (confirm('Are you sure you want to delete this message?')) {
        await deleteDoc(doc(db, "messages", msgId));
    }
}

window.archiveChat = async function (chatId) {
    if (!currentRole) return;

    const modal = document.getElementById('archive-chat-modal');
    if (modal) modal.remove();

    const msgs = storage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) return;

    const archivePromises = msgs.map(m => updateDoc(doc(db, "messages", m.id), { archived: true }));
    try {
        await Promise.all(archivePromises);
    } catch (e) {
        console.error("Error archiving chat:", e);
        alert("Failed to archive chat.");
    }
}

window.openArchiveChatModal = function(chatId) {
    const modalId = 'archive-chat-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '320px';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Archive Chat History</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body">
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1.5rem;">Are you sure you want to archive the chat history? Messages will be hidden but preserved.</p>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;">Cancel</button>
                <button onclick="archiveChat('${chatId}')" style="padding:0.5rem 1rem; border:none; background:#ef4444; color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Archive</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
}

window.openArchivedMessagesModal = function(chatId) {
    const modalId = 'archived-messages-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.dataset.chatId = chatId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '500px';
    card.style.height = '600px';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Archived Messages</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div style="padding: 0.5rem 1.5rem; border-bottom: 1px solid var(--border);">
            <input type="text" id="archived-search-input" placeholder="Search archived messages..." style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; font-size:0.85rem;" oninput="renderArchivedMessagesList('${chatId}')">
        </div>
        <div class="modal-body" id="archived-messages-list">
            <div style="text-align:center; padding:2rem; color:var(--text-muted);">Loading...</div>
        </div>
        <div style="padding:1rem; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:0.5rem;">
            <button onclick="deleteAllArchivedMessages('${chatId}')" style="padding:0.5rem 1rem; border:none; background:#ef4444; color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Delete All Permanently</button>
            <button onclick="restoreAllMessages('${chatId}')" style="padding:0.5rem 1rem; border:none; background:var(--primary); color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Restore All</button>
            <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;">Close</button>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
    
    renderArchivedMessagesList(chatId);
}

window.renderArchivedMessagesList = async function(chatId) {
    const container = document.getElementById('archived-messages-list');
    if (!container) return;
    
    const searchInput = document.getElementById('archived-search-input');
    const term = searchInput ? searchInput.value.toLowerCase() : '';

    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem; display:flex; flex-direction:column; align-items:center; gap:0.5rem;"><i class="fas fa-box-open" style="font-size:2rem; opacity:0.5"></i><span>No archived messages found.</span></div>';
        return;
    }

    container.innerHTML = '';
    
    for (const m of msgs) {
        let text = m.text;
        if (m.isEncrypted) text = await decryptData(m.text);

        if (term && !text.toLowerCase().includes(term) && !m.user.toLowerCase().includes(term)) continue;
        
        const item = document.createElement('div');
        item.style.cssText = 'background:var(--bg-body); padding:0.75rem; margin-bottom:0.5rem; border-radius:0.5rem; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;';
        
        const content = document.createElement('div');
        content.style.flex = '1';
        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                <strong style="font-size:0.8rem; color:var(--primary);">${m.user}</strong>
                <span style="font-size:0.7rem; color:var(--text-muted);">${m.time}</span>
            </div>
            <div style="font-size:0.85rem; color:var(--text-main); word-break:break-word;">${escapeHtml(text)}</div>
        `;
        
        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fas fa-trash-restore"></i>';
        btn.title = "Restore Message";
        btn.style.cssText = "border:none; background:var(--bg-card); color:var(--primary); cursor:pointer; font-size:0.9rem; padding:0.5rem; border-radius:0.25rem; border:1px solid var(--border); transition:all 0.2s;";
        btn.onmouseover = () => { btn.style.background = 'var(--primary)'; btn.style.color = 'white'; };
        btn.onmouseout = () => { btn.style.background = 'var(--bg-card)'; btn.style.color = 'var(--primary)'; };
        btn.onclick = () => restoreMessage(m.id);
        
        item.appendChild(content);
        item.appendChild(btn);
        container.appendChild(item);
    }

    if (container.children.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:2rem;">No matching messages found.</div>';
    }
}

window.restoreMessage = async function(msgId) {
    try {
        await updateDoc(doc(db, "messages", msgId), { archived: false });
    } catch (e) {
        console.error("Error restoring message:", e);
        alert("Failed to restore message.");
    }
}

window.restoreAllMessages = async function(chatId) {
    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        alert("No archived messages to restore.");
        return;
    }

    if (!confirm(`Are you sure you want to restore ${msgs.length} archived messages?`)) return;

    try {
        const promises = msgs.map(m => updateDoc(doc(db, "messages", m.id), { archived: false }));
        await Promise.all(promises);
    } catch (e) {
        console.error("Error restoring all messages:", e);
        alert("Failed to restore messages.");
    }
}

window.deleteAllArchivedMessages = async function(chatId) {
    const msgs = archivedStorage[activeStageId][chatId];
    if (!msgs || msgs.length === 0) {
        alert("No archived messages to delete.");
        return;
    }

    if (!confirm(`Are you sure you want to PERMANENTLY delete ${msgs.length} archived messages? This action cannot be undone.`)) return;

    try {
        const promises = msgs.map(m => deleteDoc(doc(db, "messages", m.id)));
        await Promise.all(promises);
    } catch (e) {
        console.error("Error deleting all archived messages:", e);
        alert("Failed to delete messages.");
    }
}

window.pinMessage = async function(chatId, msgId) {
    const msgs = storage[activeStageId][chatId];
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;

    await setDoc(doc(db, "pinned_messages", `${activeStageId}_${chatId}`), {
        stageId: activeStageId,
        projectId: currentProjectId,
        chatId: chatId,
        text: msg.text,
        isEncrypted: msg.isEncrypted,
        timestamp: serverTimestamp()
    });
}

window.unpinMessage = async function(chatId) {
    await deleteDoc(doc(db, "pinned_messages", `${activeStageId}_${chatId}`));
}

window.editMessage = async function (chatId, msgId, index) {
    const msg = storage[activeStageId][chatId][index];
    if (msg.user !== currentRole) return;
    let currentText = msg.isEncrypted ? await decryptData(msg.text) : msg.text;
    
    const modalId = 'edit-message-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Edit Message</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';

    const textarea = document.createElement('textarea');
    textarea.style.cssText = 'width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main); resize:vertical; min-height:80px; font-family:inherit; margin-bottom:1rem;';
    textarea.value = currentText;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex; justify-content:flex-end; gap:10px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;';
    cancelBtn.onclick = () => modal.remove();

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.cssText = 'padding:0.5rem 1rem; border:none; background:var(--primary); color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;';
    saveBtn.onclick = async () => {
        const newText = textarea.value.trim();
        if (newText !== "") {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
            const encrypted = await encryptData(newText);
            await updateDoc(doc(db, "messages", msgId), {
                text: encrypted,
                isEncrypted: true,
                edited: true
            });
            modal.remove();
        }
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    body.appendChild(textarea);
    body.appendChild(btnContainer);
    card.appendChild(header);
    card.appendChild(body);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
    textarea.focus();
}

window.toggleEmojiPicker = function(id) {
    const picker = document.getElementById(`emoji-picker-${id}`);
    if (picker) {
        picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
    }
}

window.insertEmoji = function(id, emoji) {
    const input = document.getElementById(`input-${id}`);
    if (input) {
        input.value += emoji;
        input.focus();
        handleTyping(id);
    }
    const picker = document.getElementById(`emoji-picker-${id}`);
    if (picker) picker.style.display = 'none';
}

window.handleTyping = function (chatId) {
    if (!currentRole) return;
    
    const now = Date.now();
    const last = lastTypingUpdate[chatId] || 0;
    // Unique ID per project/stage/chat/user
    const typingRef = doc(db, "typing", `${currentProjectId}_${activeStageId}_${chatId}_${currentRole}`);

    // Throttle updates to Firestore (max once every 2 seconds)
    if (now - last > 2000) {
        lastTypingUpdate[chatId] = now;
        setDoc(typingRef, { projectId: currentProjectId, stageId: activeStageId, chatId, user: currentRole, isTyping: true, timestamp: serverTimestamp() });
    }

    if (typingTimers[chatId]) clearTimeout(typingTimers[chatId]);

    typingTimers[chatId] = setTimeout(() => {
        // Mark as not typing after 3 seconds of inactivity
        setDoc(typingRef, { projectId: currentProjectId, stageId: activeStageId, chatId, user: currentRole, isTyping: false, timestamp: serverTimestamp() });
    }, 3000);
}

window.replyMessage = async function (chatId, index) {
    const msg = storage[activeStageId][chatId][index];
    let text = msg.isEncrypted ? await decryptData(msg.text) : msg.text;
    replyStates[chatId] = { user: msg.user, text: text };
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) {
        preview.style.display = 'block';
        preview.innerHTML = `Replying to <strong>${msg.user}</strong> <i class="fas fa-times" style="cursor:pointer; margin-left:5px;" onclick="cancelReply('${chatId}')"></i>`;
    }
    document.getElementById(`input-${chatId}`).focus();
}

window.cancelReply = function (chatId) {
    delete replyStates[chatId];
    const preview = document.getElementById(`reply-preview-${chatId}`);
    if (preview) {
        preview.style.display = 'none';
        preview.innerHTML = '';
    }
}

window.cancelUpload = function(chatId) {
    if (activeUploads[chatId]) {
        activeUploads[chatId].cancel();
    }
}

window.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

window.highlight = function (e) {
    e.preventDefault();
    e.currentTarget.style.border = '2px dashed var(--primary)';
    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
}

window.unhighlight = function (e) {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    e.currentTarget.style.border = '';
    e.currentTarget.style.backgroundColor = '';
}

window.handleDrop = function (event, chatId, vId) {
    event.preventDefault();
    event.currentTarget.style.border = '';
    event.currentTarget.style.backgroundColor = '';
    if (event.dataTransfer.files.length > 0) {
        handleFile(chatId, vId, event.dataTransfer);
    }
}

window.handleFile = async function (chatId, vId, input) {
    const filesList = input.files ? Array.from(input.files) : [input];
    if (filesList.length === 0) return;

    const pContainer = document.getElementById(`progress-container-${chatId}`);
    const pBar = document.getElementById(`progress-bar-${chatId}`);

    const uploadedNames = [];

    let i = 0;
    if (pContainer) pContainer.style.display = 'flex';

    for (const file of filesList) {
        try {
            const storageRef = ref(storageService, `files/${activeStageId}/${vId}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);
            activeUploads[chatId] = uploadTask;

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        if (pBar) pBar.style.width = `${progress}%`;
                    },
                    (error) => {
                        reject(error);
                    },
                    async () => {
                        const url = await getDownloadURL(uploadTask.snapshot.ref);
                        await addDoc(collection(db, "files"), {
                            stageId: activeStageId,
                            projectId: currentProjectId,
                            viewId: vId,
                            name: file.name,
                            url: url,
                            storagePath: uploadTask.snapshot.ref.fullPath,
                            timestamp: serverTimestamp()
                        });
                        uploadedNames.push(file.name);
                        resolve();
                    }
                );
            });
            delete activeUploads[chatId];
        } catch (error) {
            delete activeUploads[chatId];
            if (error.code === 'storage/canceled') {
                console.log("Upload canceled by user");
                break;
            }
            console.error("Error uploading file:", file.name, error);
            alert(`Failed to upload ${file.name}: ${error.message}`);
        }
    }

    if (pContainer) pContainer.style.display = 'none';
    if (pBar) pBar.style.width = '0%';

    if (uploadedNames.length > 0) {
        const text = uploadedNames.length === 1
            ? `Shared file: ${uploadedNames[0]}`
            : `Shared ${uploadedNames.length} files: ${uploadedNames.join(', ')}`;

        const encryptedText = await encryptData(text);

        await addDoc(collection(db, "messages"), {
            stageId: activeStageId,
            projectId: currentProjectId,
            chatId: chatId,
            user: currentRole,
            text: encryptedText,
            isEncrypted: true,
            timestamp: serverTimestamp()
        });
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.setViewer = function (vId, url, name) {
    const wrap = document.getElementById(`wrapper-${vId}`);
    if (wrap) {
        const lower = (name || '').toLowerCase();
        const safeName = escapeHtml(name);
        const volSlider = document.getElementById(`vol-${vId}`);
        const orbitBtn = document.getElementById(`orbit-btn-${vId}`);

        if (volSlider) {
            if (/\.(mp4|webm|ogg|mp3|wav)$/i.test(lower)) {
                volSlider.style.display = 'inline-block';
                volSlider.value = 1;
            } else {
                volSlider.style.display = 'none';
            }
        }
        if (orbitBtn) orbitBtn.style.display = 'none';

        let content;
        if (/\.(mp4|webm|ogg)$/i.test(lower)) {
            content = `<video src="${url}" id="img-${vId}" controls style="max-width:100%;max-height:100%"></video>`;
        } else if (/\.(mp3|wav)$/i.test(lower)) {
            content = `<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;background:#f8f9fa"><audio src="${url}" id="img-${vId}" controls></audio></div>`;
        } else if (/\.(pdf|txt|html)$/i.test(lower)) {
            content = `<iframe src="${url}" id="img-${vId}" style="width:100%;height:100%;border:none;background:#fff"></iframe>`;
        } else if (/\.(glb|gltf)$/i.test(lower)) {
            content = `<model-viewer src="${url}" id="img-${vId}" camera-controls style="width:100%;height:100%;"></model-viewer>`;
            if (orbitBtn) orbitBtn.style.display = 'flex';
        } else if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lower)) {
            content = `<img src="${url}" id="img-${vId}">`;
        } else if (/\.(dwg|dxf)$/i.test(lower)) {
            content = `<div id="img-${vId}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;background:#f0f0f0;color:#666;text-align:center;padding:20px;">
                        <i class="fas fa-layer-group" style="font-size:3rem;margin-bottom:15px;opacity:0.5"></i>
                        <div style="font-weight:bold;margin-bottom:5px">${safeName}</div>
                        <div style="font-size:0.8rem;margin-bottom:15px">CAD Preview not supported in browser</div>
                        <a href="${url}" download="${safeName}" style="color:var(--primary);text-decoration:underline;cursor:pointer">Download File</a>
                    </div>`;
        } else if (/\.(doc|docx|xls|xlsx|ppt|pptx|csv)$/i.test(lower)) {
            content = `<div id="img-${vId}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;width:100%;background:#f0f0f0;color:#666;text-align:center;padding:20px;">
                        <i class="fas fa-file-alt" style="font-size:3rem;margin-bottom:15px;opacity:0.5"></i>
                        <div style="font-weight:bold;margin-bottom:5px">${safeName}</div>
                        <div style="font-size:0.8rem;margin-bottom:15px">Document Preview not supported in browser</div>
                        <a href="${url}" download="${safeName}" style="color:var(--primary);text-decoration:underline;cursor:pointer">Download File</a>
                    </div>`;
        } else {
            content = `<iframe src="${url}" id="img-${vId}" style="width:100%;height:100%;border:none;background:#fff"></iframe>`;
        }
        wrap.innerHTML = content;
        if (viewerStates[vId] && viewerStates[vId].currentUrl === url) {
            const el = document.getElementById(`img-${vId}`);
            if (el) el.style.transform = `scale(${viewerStates[vId].zoom}) rotate(${viewerStates[vId].rot}deg)`;
        } else {
            viewerStates[vId] = { zoom: 1, rot: 0, currentUrl: url };
        }
    }
}

window.zoom = function (id, delta) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    viewerStates[id].zoom = Math.max(0.1, viewerStates[id].zoom + delta);
    el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
}

window.rotate = function (id, delta) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    viewerStates[id].rot += 90;
    el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
}

window.resetViewer = function (id) {
    const el = document.getElementById(`img-${id}`);
    if (!el) return;
    viewerStates[id].zoom = 1;
    viewerStates[id].rot = 0;
    el.style.transform = `scale(1) rotate(0deg)`;
}

window.setVolume = function (id, val) {
    const el = document.getElementById(`img-${id}`);
    if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
        el.volume = val;
    }
}

window.toggleOrbit = function (id) {
    const el = document.getElementById(`img-${id}`);
    if (el && el.tagName === 'MODEL-VIEWER') {
        if (el.hasAttribute('auto-rotate')) {
            el.removeAttribute('auto-rotate');
        } else {
            el.setAttribute('auto-rotate', '');
        }
    }
}

window.toggleFullscreen = function (id) {
    const el = document.getElementById(`viewer-container-${id}`);
    if (!el) return;
    if (!document.fullscreenElement) {
        const onFsChange = () => {
            if (!document.fullscreenElement) {
                resetViewer(id);
                el.removeEventListener('fullscreenchange', onFsChange);
            }
        };
        el.addEventListener('fullscreenchange', onFsChange);
        el.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
}

window.downloadAll = function (vId) {
    const list = files[activeStageId][vId];
    if (!list || list.length === 0) {
        alert('No files to download for this view.');
        return;
    }

    list.forEach((f, i) => {
        setTimeout(() => {
            const a = document.createElement('a');
            a.href = f.url;
            a.download = f.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, i * 500);
    });
}

window.viewAllFiles = function (chatId, vId) {
    const stageFiles = files[activeStageId][vId];
    if (!stageFiles || stageFiles.length === 0) return;

    const modalId = 'files-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Files in ${activeStageId.toUpperCase()}</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const searchContainer = document.createElement('div');
    searchContainer.style.padding = '0 1.5rem';
    searchContainer.style.display = 'flex';
    searchContainer.style.gap = '10px';

    const searchInput = document.createElement('input');
    searchInput.placeholder = 'Filter files...';
    searchInput.style.cssText = 'flex:1;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem';

    const sortSelect = document.createElement('select');
    sortSelect.style.cssText = 'padding:8px;border:1px solid var(--border);border-radius:4px;font-size:0.8rem;background:var(--bg-body);cursor:pointer';
    sortSelect.innerHTML = `
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">Name (A-Z)</option>
                <option value="za">Name (Z-A)</option>
            `;

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(sortSelect);

    const list = document.createElement('div');
    list.className = 'modal-body';

    const renderList = () => {
        list.innerHTML = '';
        const term = searchInput.value.toLowerCase();
        const sort = sortSelect.value;

        let arr = [...stageFiles];

        arr.sort((a, b) => {
            if (sort === 'az') return a.name.localeCompare(b.name);
            if (sort === 'za') return b.name.localeCompare(a.name);
            const da = a.date || 0;
            const db = b.date || 0;
            if (sort === 'oldest') return da - db;
            return db - da;
        });

        arr.forEach(f => {
            if (term && !f.name.toLowerCase().includes(term)) return;

            const item = document.createElement('div');
            item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.5rem;background:var(--bg-body);border-radius:4px';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:10px;flex:1';
            nameSpan.textContent = f.name;

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '10px';

            const viewBtn = document.createElement('i');
            viewBtn.className = 'fas fa-eye';
            viewBtn.style.cursor = 'pointer';
            viewBtn.style.color = 'var(--primary)';
            viewBtn.title = 'View';
            viewBtn.onclick = () => {
                setViewer(vId, f.url, f.name);
                modal.remove();
            };

            const downBtn = document.createElement('a');
            downBtn.href = f.url;
            downBtn.download = f.name;
            downBtn.innerHTML = '<i class="fas fa-download"></i>';
            downBtn.style.color = 'var(--text-muted)';
            downBtn.title = 'Download';

            actions.appendChild(viewBtn);
            actions.appendChild(downBtn);

            item.appendChild(nameSpan);
            item.appendChild(actions);
            list.appendChild(item);
        });
    };

    searchInput.oninput = renderList;
    sortSelect.onchange = renderList;

    card.appendChild(header);
    card.appendChild(searchContainer);
    card.appendChild(list);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
    renderList();
}

window.openSettingsModal = function () {
    if (!currentRole) {
        alert("Please select a role to access settings.");
        return;
    }

    const modalId = 'settings-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Settings</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    
    const currentName = roleProfiles[currentRole].name;

    body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div>
                <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem; color:var(--text-muted)">Display Name</label>
                <input type="text" id="settings-name-input" value="${currentName}" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main)">
            </div>
            <button onclick="saveSettings()" style="background:var(--primary); color:white; border:none; padding:0.75rem; border-radius:0.25rem; cursor:pointer; font-weight:600">Save Changes</button>
        </div>
    `;

    card.appendChild(header);
    card.appendChild(body);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

window.toggleSettingsDropdown = function() {
    const dropdown = document.getElementById('settingsDropdown');
    const input = document.getElementById('settingsNameInput');
    const statusSelect = document.getElementById('settingsStatusSelect');
    const themeToggle = document.getElementById('settingsThemeToggle');
    const muteToggle = document.getElementById('settingsMuteToggle');
    const projectContainer = document.getElementById('ownerProjectNameContainer');
    const projectManagement = document.getElementById('projectManagementSection');
    const projectInput = document.getElementById('settingsProjectNameInput');
    
    if (!dropdown) return;
    
    if (dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    } else {
        dropdown.classList.add('active');
        if (currentRole && roleProfiles[currentRole]) {
            input.value = roleProfiles[currentRole].name;
            if (statusSelect) statusSelect.value = roleProfiles[currentRole].status || 'online';
            if (themeToggle) themeToggle.checked = roleProfiles[currentRole].theme === 'dark';
            if (muteToggle) muteToggle.checked = !!roleProfiles[currentRole].muteNotifications;
            
            if (currentRole === 'owner' && projectContainer) {
                projectContainer.style.display = 'block';
                if (projectManagement) {
                    projectManagement.style.display = 'block';
                    const deleteBtn = projectManagement.querySelector('button[onclick="deleteProject()"]');
                    if (deleteBtn) {
                        deleteBtn.style.display = currentProjectId === 'default' ? 'none' : 'block';
                    }
                }
                if (projectInput) projectInput.value = currentProjectName;
            } else if (projectContainer) {
                projectContainer.style.display = 'none';
                if (projectManagement) projectManagement.style.display = 'none';
            }
        }
    }
}

window.saveSettingsFromDropdown = async function() {
    const input = document.getElementById('settingsNameInput');
    const statusSelect = document.getElementById('settingsStatusSelect');
    const themeToggle = document.getElementById('settingsThemeToggle');
    const muteToggle = document.getElementById('settingsMuteToggle');
    const projectInput = document.getElementById('settingsProjectNameInput');
    const saveBtn = document.querySelector('.dropdown-save-btn');

    if (input && input.value.trim() !== "" && currentRole) {
        const originalText = saveBtn ? saveBtn.textContent : 'Save Changes';
        if (saveBtn) {
            saveBtn.textContent = 'Saving...';
            saveBtn.disabled = true;
        }

        const newName = input.value.trim();
        const newStatus = statusSelect ? statusSelect.value : 'online';
        const newTheme = themeToggle && themeToggle.checked ? 'dark' : 'light';
        const isMuted = muteToggle ? muteToggle.checked : false;
        try {
            await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { name: newName, status: newStatus, muteNotifications: isMuted, theme: newTheme }, { merge: true });
            
            if (currentRole === 'owner' && projectInput) {
                const newProjectName = projectInput.value.trim();
                if (newProjectName) {
                    await setDoc(doc(db, "projects", currentProjectId), { name: newProjectName }, { merge: true });
                }
            }
            
            toggleSettingsDropdown();
        } catch (e) {
            console.error("Error saving settings:", e);
            alert("Failed to save settings.");
        } finally {
            if (saveBtn) {
                saveBtn.textContent = originalText;
                saveBtn.disabled = false;
            }
        }
    }
}

window.openLogoutConfirmationModal = function() {
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');

    const modalId = 'logout-confirm-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '320px';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Confirm Logout</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body">
            <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:1.5rem;">Are you sure you want to log out?</p>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.5rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.25rem; cursor:pointer; font-size:0.85rem;">Cancel</button>
                <button onclick="logout(true)" style="padding:0.5rem 1rem; border:none; background:#ef4444; color:white; border-radius:0.25rem; cursor:pointer; font-size:0.85rem; font-weight:500;">Logout</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
}

window.saveSettings = async function() {
    const input = document.getElementById('settings-name-input');
    if (input && input.value.trim() !== "") {
        const newName = input.value.trim();
        
        try {
            await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { name: newName }, { merge: true });
            document.getElementById('settings-modal').remove();
        } catch (e) {
            console.error("Error saving settings:", e);
            alert("Failed to save settings.");
        }
    }
}

window.submitContactForm = async function(event) {
    event.preventDefault();
    const form = event.target;
    const nameInput = form.querySelector('input[type="text"]');
    const emailInput = form.querySelector('input[type="email"]');
    const msgInput = form.querySelector('textarea');
    const btn = form.querySelector('button[type="submit"]');

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const message = msgInput.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address.');
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        await addDoc(collection(db, "contact_messages"), {
            name,
            email,
            message,
            projectId: currentProjectId,
            userRole: currentRole || 'guest',
            timestamp: serverTimestamp(),
            status: 'new'
        });

        form.style.display = 'none';
        document.getElementById('success-msg').style.display = 'flex';
        setTimeout(() => document.getElementById('contact-modal').remove(), 3000);
    } catch (e) {
        console.error("Error sending message:", e);
        alert("Failed to send message. Please try again.");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

window.openContactModal = function (e) {
    if (e) e.preventDefault();

    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown && dropdown.classList.contains('active')) {
        dropdown.classList.remove('active');
    }

    const modalId = 'contact-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Contact Us</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
                <form onsubmit="submitContactForm(event)" style="display:flex; flex-direction:column; gap:1rem;">
                    <div>
                        <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem; color:var(--text-muted)">Name</label>
                        <input type="text" required style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main)">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem; color:var(--text-muted)">Email</label>
                        <input type="email" required style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main)">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.85rem; margin-bottom:0.25rem; color:var(--text-muted)">Message</label>
                        <textarea required rows="4" style="width:100%; padding:0.5rem; border:1px solid var(--border); border-radius:0.25rem; background:var(--bg-body); color:var(--text-main); resize:vertical"></textarea>
                    </div>
                    <button type="submit" style="background:var(--primary); color:white; border:none; padding:0.75rem; border-radius:0.25rem; cursor:pointer; font-weight:600">Send Message</button>
                </form>
                <div id="success-msg" style="display:none; flex-direction:column; align-items:center; justify-content:center; padding:3rem 1rem; text-align:center; animation: fadeIn 0.5s ease-out;">
                    <div style="width: 70px; height: 70px; background: rgba(16, 185, 129, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 1.5rem;">
                        <i class="fas fa-check" style="font-size:2rem; color:#10b981;"></i>
                    </div>
                    <h3 style="margin-bottom:0.5rem; color:var(--text-main); font-size: 1.25rem;">Message Sent Successfully</h3>
                    <p style="color:var(--text-muted); font-size: 0.9rem; max-width: 260px; line-height: 1.5;">Thank you for reaching out. Our team will review your message and get back to you shortly.</p>
                </div>
            `;

    card.appendChild(header);
    card.appendChild(body);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

window.openTermsModal = function (e) {
    if (e) e.preventDefault();
    const modalId = 'terms-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '700px';
    card.style.height = '80vh';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Terms of Service</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
        <div style="line-height: 1.6; color: var(--text-main); font-size: 0.9rem;">
            <p style="margin-bottom: 1rem; font-style: italic; color: var(--text-muted);">Last Updated: ${new Date().toLocaleDateString()}</p>

            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">1. Acceptance of Terms</h4>
            <p style="margin-bottom: 1rem;">By accessing and using the BIM Viewer platform ("Service"), provided by OJ Evolve ("Company", "we", "us", or "our"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use this Service.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">2. Description of Service</h4>
            <p style="margin-bottom: 1rem;">BIM Viewer is a collaborative web-based platform designed for construction and engineering professionals to view, share, and discuss Building Information Modeling (BIM) data, documents, and project stages. The Service includes role-based access, real-time messaging, and file visualization tools.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">3. User Accounts and Security</h4>
            <p style="margin-bottom: 1rem;">You are responsible for maintaining the confidentiality of your project access keys and user role sessions. You agree to notify us immediately of any unauthorized use of your account. The Service utilizes end-to-end encryption for project data; however, you acknowledge that you are responsible for the safekeeping of the decryption keys (project passwords).</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">4. Intellectual Property Rights</h4>
            <p style="margin-bottom: 1rem;"><strong>Platform:</strong> The Service and its original content, features, and functionality are owned by OJ Evolve and are protected by international copyright, trademark, patent, trade secret, and other intellectual property or proprietary rights laws.</p>
            <p style="margin-bottom: 1rem;"><strong>User Content:</strong> You retain all rights to the data, files, and models you upload to the Service. By uploading content, you grant the Company a license to host, store, and display such content solely for the purpose of providing the Service to you and your authorized project collaborators.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">5. User Conduct</h4>
            <p style="margin-bottom: 1rem;">You agree not to use the Service to:</p>
            <ul style="margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;">
                <li>Upload or transmit any content that is unlawful, harmful, threatening, abusive, or otherwise objectionable.</li>
                <li>Upload viruses, malware, or any other malicious code.</li>
                <li>Attempt to gain unauthorized access to any portion of the Service or any other systems or networks connected to the Service.</li>
                <li>Reverse engineer, decompile, or disassemble any aspect of the Service.</li>
            </ul>

            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">6. Disclaimer of Warranties</h4>
            <p style="margin-bottom: 1rem;">The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Company makes no representations or warranties of any kind, express or implied, regarding the operation of the Service or the information, content, or materials included therein.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">7. Limitation of Liability</h4>
            <p style="margin-bottom: 1rem;">In no event shall OJ Evolve, its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">8. Changes to Terms</h4>
            <p style="margin-bottom: 0;">We reserve the right, at our sole discretion, to modify or replace these Terms at any time. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.</p>
        </div>
        <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border);">
            <button onclick="document.getElementById('${modalId}').remove()" style="background:var(--primary); color:white; border:none; padding:0.5rem 1.5rem; border-radius:0.25rem; cursor:pointer; font-weight:600">I Understand & Agree</button>
        </div>
    `;

    card.appendChild(header);
    card.appendChild(body);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

window.openPrivacyModal = function (e) {
    if (e) e.preventDefault();
    const modalId = 'privacy-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '700px';
    card.style.height = '80vh';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span class="card-title">Privacy Policy</span><i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>`;

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
        <div style="line-height: 1.6; color: var(--text-main); font-size: 0.9rem;">
            <p style="margin-bottom: 1rem; font-style: italic; color: var(--text-muted);">Last Updated: ${new Date().toLocaleDateString()}</p>

            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">1. Introduction</h4>
            <p style="margin-bottom: 1rem;">OJ Evolve ("we," "our," or "us") respects your privacy and is committed to protecting it through our compliance with this policy. This policy describes the types of information we may collect from you or that you may provide when you visit the BIM Viewer platform (our "Service") and our practices for collecting, using, maintaining, protecting, and disclosing that information.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">2. Information We Collect</h4>
            <p style="margin-bottom: 0.5rem;"><strong>Personal Information:</strong> We collect information by which you may be personally identified, such as name, email address, and professional role when you configure your user profile.</p>
            <p style="margin-bottom: 1rem;"><strong>Project Data:</strong> We store files, architectural drawings, chat messages, and other project-related data you upload. Note that sensitive project data is encrypted before storage.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">3. How We Use Your Information</h4>
            <p style="margin-bottom: 1rem;">We use information that we collect about you or that you provide to us, including any personal information:</p>
            <ul style="margin-bottom: 1rem; padding-left: 1.5rem; list-style-type: disc;">
                <li>To present our Service and its contents to you.</li>
                <li>To provide you with information, products, or services that you request from us.</li>
                <li>To fulfill any other purpose for which you provide it (e.g., facilitating project collaboration).</li>
                <li>To notify you about changes to our Service.</li>
            </ul>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">4. Data Security</h4>
            <p style="margin-bottom: 1rem;">We have implemented measures designed to secure your personal information from accidental loss and from unauthorized access, use, alteration, and disclosure. Project messages and sensitive text are encrypted using client-side derived keys before being stored in our database.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">5. Data Retention</h4>
            <p style="margin-bottom: 1rem;">We retain your personal information and project data only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your information to the extent necessary to comply with our legal obligations, resolve disputes, and enforce our legal agreements and policies.</p>

            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">6. Your Data Rights</h4>
            <p style="margin-bottom: 1rem;">Depending on your location, you may have rights regarding your personal data, including the right to access, correct, or delete the personal information we hold about you. You can manage your profile settings directly within the application or contact us for assistance.</p>
            
            <h4 style="margin-bottom: 0.5rem; color: var(--primary);">7. Contact Information</h4>
            <p style="margin-bottom: 0;">To ask questions or comment about this privacy policy and our privacy practices, please contact us via the "Contact Us" form available in the application footer.</p>
        </div>
        <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid var(--border);">
            <button onclick="document.getElementById('${modalId}').remove()" style="background:var(--primary); color:white; border:none; padding:0.5rem 1.5rem; border-radius:0.25rem; cursor:pointer; font-weight:600">I Understand</button>
        </div>
    `;

    card.appendChild(header);
    card.appendChild(body);
    modal.appendChild(card);

    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
}

window.onload = async () => {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
    document.body.appendChild(script);

    window.scrollTo(0, 0);
    initStages();

    // Back to Top Button
    const backToTop = document.createElement('button');
    backToTop.className = 'back-to-top';
    backToTop.innerHTML = '<i class="fas fa-arrow-up"></i>';
    backToTop.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(backToTop);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }

        const dashboardHeader = document.getElementById('dashboardHeader');
        if (dashboardHeader) {
            if (window.scrollY > 10) {
                dashboardHeader.classList.add('scrolled');
            } else {
                dashboardHeader.classList.remove('scrolled');
            }
        }
    });

    // Mobile Sidebar Logic
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const mobileSidebar = document.getElementById('mobileSidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    function toggleSidebar() {
        mobileSidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('active');
    }

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // Header Toggle Logic
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            const grid = document.getElementById('dashboardGrid');
            if (!grid) return;
            const isSecondary = grid.classList.contains('view-secondary');
            switchMobileGroup(isSecondary ? 'group-1' : 'group-2');
        });
    }

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
        const dropdown = document.getElementById('settingsDropdown');
        const avatar = document.getElementById('userAvatar');
        if (dropdown && dropdown.classList.contains('active') && !dropdown.contains(e.target) && !avatar.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Settings Toggles - Immediate Effect
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('change', async (e) => {
            if (currentRole) {
                const newTheme = e.target.checked ? 'dark' : 'light';
                applyTheme(newTheme);
                if (roleProfiles[currentRole]) roleProfiles[currentRole].theme = newTheme;
                
                try {
                    await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { theme: newTheme }, { merge: true });
                } catch (err) {
                    console.error("Error saving theme:", err);
                }
            }
        });
    }

    const muteToggle = document.getElementById('settingsMuteToggle');
    if (muteToggle) {
        muteToggle.addEventListener('change', async (e) => {
            if (currentRole) {
                const isMuted = e.target.checked;
                if (roleProfiles[currentRole]) roleProfiles[currentRole].muteNotifications = isMuted;
                
                try {
                    await setDoc(doc(db, "projects", currentProjectId, "profiles", currentRole), { muteNotifications: isMuted }, { merge: true });
                } catch (err) {
                    console.error("Error saving mute setting:", err);
                }
            }
        });
    }

    // Keyboard shortcut for search (Ctrl+K)
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            const searchC1 = document.getElementById('search-c1');
            const searchC2 = document.getElementById('search-c2');
            
            if (document.activeElement === searchC1 && searchC2) {
                searchC2.focus();
            } else if (searchC1) {
                searchC1.focus();
            }
        }

        if (e.key === 'Escape') {
            const active = document.activeElement;
            if (active && active.classList.contains('search-input')) {
                e.preventDefault();
                active.value = '';
                active.blur();
                const chatId = active.id.replace('search-', '');
                handleSearchInput(chatId);
            }
        }
    });

    await initEncryption();
};

function playNotificationSound() {
    if (currentRole && roleProfiles[currentRole] && roleProfiles[currentRole].muteNotifications) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.error("Audio play failed", e);
    }
}

async function initEncryption() {
    if (cryptoKey) return;

    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
        let password = sessionStorage.getItem('bim_project_password');
        if (!password) {
            password = await new Promise((resolve) => {
                const modalId = 'password-modal';
                const existing = document.getElementById(modalId);
                if (existing) existing.remove();

                const modal = document.createElement('div');
                modal.id = modalId;
                modal.className = 'modal-overlay';
                modal.style.zIndex = '9999';
                modal.style.backdropFilter = 'blur(5px)';
                modal.style.backgroundColor = 'rgba(0,0,0,0.8)';

                const card = document.createElement('div');
                card.className = 'modal-card';
                card.style.maxWidth = '360px';
                card.style.animation = 'fadeIn 0.3s ease-out';

                const header = document.createElement('div');
                header.className = 'modal-header';
                header.innerHTML = `<span class="card-title"><i class="fas fa-lock" style="margin-right:8px; color:var(--primary)"></i>Project Security</span>`;

                const body = document.createElement('div');
                body.className = 'modal-body';
                
                const desc = document.createElement('p');
                desc.style.cssText = 'font-size:0.9rem; color:var(--text-muted); margin-bottom:1.5rem; line-height:1.5;';
                desc.textContent = 'This project is end-to-end encrypted. Please enter the project key to access the workspace.';

                const inputContainer = document.createElement('div');
                inputContainer.style.cssText = 'position:relative; margin-bottom:1rem;';

                const input = document.createElement('input');
                input.type = 'password';
                input.value = 'bim-collab-secure-2024';
                input.placeholder = 'Enter password';
                input.onblur = () => input.style.borderColor = 'var(--border)';

                const toggleIcon = document.createElement('i');
                toggleIcon.className = 'fas fa-eye';
                toggleIcon.style.cssText = 'position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--text-muted); font-size:0.9rem;';
                toggleIcon.onclick = () => {
                    const type = input.type === 'password' ? 'text' : 'password';
                    input.type = type;
                    toggleIcon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
                };

                inputContainer.appendChild(input);
                inputContainer.appendChild(toggleIcon);

                const btn = document.createElement('button');
                btn.textContent = 'Unlock Workspace';
                btn.style.cssText = 'width:100%; background:var(--primary); color:white; border:none; padding:0.75rem; border-radius:0.375rem; cursor:pointer; font-weight:600; font-size:0.95rem; transition: opacity 0.2s;';
                btn.onmouseover = () => btn.style.opacity = '0.9';
                btn.onmouseout = () => btn.style.opacity = '1';

                const submit = () => {
                    if (input.value.trim()) {
                        modal.remove();
                        resolve(input.value.trim());
                    }
                };

                btn.onclick = submit;
                input.onkeypress = (e) => {
                    if (e.key === 'Enter') submit();
                };

                body.appendChild(desc);
                body.appendChild(inputContainer);
                body.appendChild(btn);
                card.appendChild(header);
                card.appendChild(body);
                modal.appendChild(card);
                document.body.appendChild(modal);
                
                setTimeout(() => input.focus(), 50);
            });

            if (password) sessionStorage.setItem('bim_project_password', password);
            else {
                initializationPromise = null;
                return;
            }
        }

        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        // Using a static salt for this demo to ensure all users derive the same key
        const salt = enc.encode("bim-viewer-shared-salt");

        cryptoKey = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    })();

    await initializationPromise;
}

async function encryptData(text) {
    if (!cryptoKey) await initEncryption();
    if (!cryptoKey) throw new Error("Encryption key not available");
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        cryptoKey,
        encoded
    );
    const encryptedArray = new Uint8Array(encrypted);
    const buf = new Uint8Array(iv.length + encryptedArray.length);
    buf.set(iv);
    buf.set(encryptedArray, iv.length);
    
    let binary = '';
    for (let i = 0; i < buf.length; i++) {
        binary += String.fromCharCode(buf[i]);
    }
    return btoa(binary);
}

async function decryptData(encryptedText) {
    if (!cryptoKey) await initEncryption();
    if (!cryptoKey) return "*** Key Missing ***";
    try {
        const data = new Uint8Array(atob(encryptedText).split("").map(c => c.charCodeAt(0)));
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            cryptoKey,
            encrypted
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        return "*** Encrypted Content ***";
    }
}

function applyTheme(theme) {
    if (theme === 'system') {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-mode', systemDark);
    } else {
        document.body.classList.toggle('dark-mode', theme === 'dark');
    }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (currentRole && roleProfiles[currentRole]?.theme === 'system') {
        document.body.classList.toggle('dark-mode', e.matches);
    }
});

/* --- Multi-Project Management --- */

function setupProjectsListListener() {
    if (unsubscribeProjectsList) unsubscribeProjectsList();
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    unsubscribeProjectsList = onSnapshot(q, (snapshot) => {
        const select = document.getElementById('projectSelect');
        if (!select) return;
        
        select.innerHTML = '';
        
        let projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (!projects.find(p => p.id === 'default')) {
            projects.push({ id: 'default', name: 'Default Project' });
        }
        
        const sortedDocs = projects.sort((a, b) => {
            if (a.id === 'default') return -1;
            if (b.id === 'default') return 1;
            return 0;
        });

        sortedDocs.forEach(data => {
            const opt = document.createElement('option');
            opt.value = data.id;
            opt.textContent = data.name || "Default Project";
            if (data.id === currentProjectId) opt.selected = true;
            select.appendChild(opt);
        });
    });
}

window.switchProject = function(projectId) {
    if (projectId === currentProjectId) return;
    
    showProjectOverview = false;
    currentProjectId = projectId;
    localStorage.setItem('bim_project_id', projectId);
    
    // Reset state for new project
    activeStageId = 's1';
    sessionReadThresholds = {};
    initStages();
    
    // Reset Role Profiles to defaults to avoid data leak from previous project
    Object.keys(defaultRoleProfiles).forEach(role => {
        roleProfiles[role] = { ...defaultRoleProfiles[role] };
    });

    // Unsubscribe existing listeners
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeFiles) unsubscribeFiles();
    if (unsubscribeTyping) unsubscribeTyping();
    if (unsubscribePinned) unsubscribePinned();
    if (unsubscribeAllProfiles) unsubscribeAllProfiles();
    if (unsubscribeProjectSettings) unsubscribeProjectSettings();

    // Clear local data caches
    projectStages.forEach(s => {
        storage[s.id] = { c1: [], c2: [] };
        archivedStorage[s.id] = { c1: [], c2: [] };
        files[s.id] = { v1: [], v2: [] };
    });

    // Re-initialize
    setupFirebaseListeners(activeStageId);
    setupGlobalProfileListener();
    setupProjectSettingsListener();
    
    // Refresh UI
    updateDashboardTitleAndSidebar();
    renderWorkspace();
    
    // Close settings
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

window.createProject = function() {
    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');
    openCreateProjectModal();
}

window.openCreateProjectModal = function() {
    const modalId = 'create-project-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.zIndex = '3000';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';
    card.style.animation = 'fadeIn 0.2s ease-out';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title"><i class="fas fa-plus-circle" style="color:var(--primary); margin-right:8px;"></i>New Project</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1rem;">Enter a name for your new project workspace.</p>
            <input type="text" id="new-project-name" placeholder="Project Name (e.g. Sky Tower Phase 1)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-body); color:var(--text-main); margin-bottom:1rem; font-size:0.95rem;" onkeypress="if(event.key==='Enter') performProjectCreation()">
            <textarea id="new-project-desc" placeholder="Description (Optional)" style="width:100%; padding:0.75rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-body); color:var(--text-main); margin-bottom:1.5rem; font-size:0.95rem; resize:vertical; min-height:80px; font-family:inherit;"></textarea>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectCreation()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.3);">Create Project</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
    
    setTimeout(() => {
        const input = document.getElementById('new-project-name');
        if(input) input.focus();
    }, 50);
}

window.performProjectCreation = async function() {
    const input = document.getElementById('new-project-name');
    const descInput = document.getElementById('new-project-desc');
    if (!input || !input.value.trim()) return;
    
    const name = input.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const modal = document.getElementById('create-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectCreation"]') : null;
    
    if (btn) {
        btn.textContent = 'Creating...';
        btn.disabled = true;
    }

    try {
        const batch = writeBatch(db);
        const newProjectRef = doc(collection(db, "projects"));
        
        batch.set(newProjectRef, { name: name, description: description, createdAt: serverTimestamp(), owner: currentRole });
        
        // Initialize profiles for the new project
        Object.keys(defaultRoleProfiles).forEach(role => {
            const profileRef = doc(db, "projects", newProjectRef.id, "profiles", role);
            batch.set(profileRef, { ...defaultRoleProfiles[role] });
        });

        await batch.commit();
        
        if (modal) modal.remove();
        switchProject(newProjectRef.id);
    } catch (e) {
        console.error("Error creating project:", e);
        alert("Failed to create project.");
        if (btn) {
            btn.textContent = 'Create Project';
            btn.disabled = false;
        }
    }
}

window.deleteProject = function() {
    if (currentRole !== 'owner') return;
    
    if (currentProjectId === 'default') {
        alert("The default project cannot be deleted.");
        return;
    }

    const dropdown = document.getElementById('settingsDropdown');
    if (dropdown) dropdown.classList.remove('active');

    openDeleteProjectModal(currentProjectId, currentProjectName);
}

window.toggleProjectOverview = function() {
    showProjectOverview = !showProjectOverview;
    renderWorkspace();
}

async function renderProjectOverview(panel) {
    panel.innerHTML = `
        <div style="margin-bottom:1rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem;">
                <button onclick="toggleProjectOverview()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;"><i class="fas fa-arrow-left"></i> Back to Dashboard</button>
                <button onclick="createProject()" style="padding:0.5rem 1rem; background:var(--primary); color:white; border:none; border-radius:0.5rem; cursor:pointer; font-weight:600;">+ New Project</button>
            </div>
            <div style="position:relative;">
                <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--text-muted);"></i>
                <input type="text" placeholder="Search projects..." style="width:100%; padding:0.75rem 0.75rem 0.75rem 2.5rem; border:1px solid var(--border); border-radius:0.5rem; background:var(--bg-card); color:var(--text-main); font-size:0.9rem;" oninput="filterProjectList(this.value)">
            </div>
        </div>
        <div id="project-list-container" class="dashboard-grid grid-2">
            <div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">Loading projects...</div>
        </div>
    `;
    
    const container = document.getElementById('project-list-container');
    
    try {
        const snapshot = await getDocs(query(collection(db, "projects"), orderBy("createdAt", "desc")));
        
        if (snapshot.empty) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:var(--text-muted);">No projects found.</div>`;
            return;
        }
        
        container.innerHTML = '';
        
        let projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (!projects.find(p => p.id === 'default')) {
            projects.push({ id: 'default', name: 'Default Project', createdAt: null });
        }

        const sortedDocs = projects.sort((a, b) => {
            if (a.id === 'default') return -1;
            if (b.id === 'default') return 1;
            return 0;
        });

        sortedDocs.forEach(data => {
            const isCurrent = data.id === currentProjectId;
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString() : 'N/A';
            
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = `position:relative; transition:transform 0.2s; ${isCurrent ? 'border:2px solid var(--primary);' : ''}`;
            if (!isCurrent) {
                card.onmouseover = () => card.style.transform = 'translateY(-2px)';
                card.onmouseout = () => card.style.transform = 'translateY(0)';
            }
            
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title" style="font-size:1rem;">${escapeHtml(data.name || 'Default Project')}</span>
                    ${isCurrent ? '<span style="font-size:0.6rem; background:var(--primary); color:white; padding:2px 6px; border-radius:4px;">ACTIVE</span>' : ''}
                </div>
                <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:1.5rem 0; opacity:0.8; cursor:pointer;" onclick="switchProject('${data.id}')">
                    <i class="fas fa-building" style="font-size:2.5rem; margin-bottom:0.75rem; color:var(--text-muted);"></i>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Created: ${date}</div>
                </div>
                <div style="display:flex; gap:10px; margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">
                    <button onclick="switchProject('${data.id}')" style="flex:1; padding:0.5rem; background:var(--bg-body); color:var(--primary); border:1px solid var(--border); border-radius:0.25rem; cursor:pointer; font-weight:500;">${isCurrent ? 'Current' : 'Open'}</button>
                    ${data.id !== 'default' ? `<button onclick="deleteProjectById('${data.id}', '${escapeHtml(data.name || 'Project')}')" style="padding:0.5rem 0.75rem; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); border-radius:0.25rem; cursor:pointer;" title="Delete Project"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            `;
            container.appendChild(card);
        });
        
    } catch (e) {
        console.error("Error loading projects:", e);
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:#ef4444;">Failed to load projects.</div>`;
    }
}

window.deleteProjectById = function(id, name) {
    openDeleteProjectModal(id, name);
}

window.renameProject = function() {
    const input = document.getElementById('settingsProjectNameInput');
    if (!input || !input.value.trim()) return;
    
    const newName = input.value.trim();
    openRenameConfirmationModal(newName);
}

window.openRenameConfirmationModal = function(newName) {
    const modalId = 'rename-project-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.zIndex = '3000';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';
    card.style.animation = 'fadeIn 0.2s ease-out';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Confirm Rename</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Are you sure you want to rename this project to <strong>"${escapeHtml(newName)}"</strong>?
            </p>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectRename()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">Rename</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
}

window.performProjectRename = async function() {
    const input = document.getElementById('settingsProjectNameInput');
    if (!input) return;
    const newName = input.value.trim();
    
    const modal = document.getElementById('rename-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectRename"]') : null;
    
    if (btn) {
        btn.textContent = 'Renaming...';
        btn.disabled = true;
    }

    const settingsBtn = input.nextElementSibling;
    const originalText = settingsBtn ? settingsBtn.textContent : 'Rename';
    if (settingsBtn) {
        settingsBtn.textContent = '...';
        settingsBtn.disabled = true;
    }

    try {
        await setDoc(doc(db, "projects", currentProjectId), { name: newName }, { merge: true });
        
        if (modal) modal.remove();
        
        if (settingsBtn) {
            settingsBtn.textContent = 'Done';
            setTimeout(() => {
                settingsBtn.textContent = 'Rename';
                settingsBtn.disabled = false;
            }, 1500);
        }
    } catch (e) {
        console.error("Error renaming project:", e);
        alert("Failed to rename project.");
        if (modal) modal.remove();
        if (settingsBtn) {
            settingsBtn.textContent = originalText;
            settingsBtn.disabled = false;
        }
    }
}

window.resetProjectName = function() {
    openResetProjectNameModal();
}

window.openResetProjectNameModal = function() {
    const modalId = 'reset-project-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.zIndex = '3000';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';
    card.style.animation = 'fadeIn 0.2s ease-out';

    card.innerHTML = `
        <div class="modal-header">
            <span class="card-title">Confirm Reset</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body">
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem;">
                Are you sure you want to revert the project name to <strong>'Default Project'</strong>?
            </p>
            <div style="display:flex; gap:10px; justify-content:flex-end; width:100%;">
                <button onclick="document.getElementById('${modalId}').remove()" style="padding:0.75rem 1rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performResetProjectName()" style="padding:0.75rem 1.5rem; border:none; background:var(--primary); color:white; border-radius:0.5rem; cursor:pointer; font-weight:600;">Reset</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
}

window.performResetProjectName = async function() {
    const modal = document.getElementById('reset-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performResetProjectName"]') : null;
    
    if (btn) {
        btn.textContent = 'Resetting...';
        btn.disabled = true;
    }
    
    const input = document.getElementById('settingsProjectNameInput');
    if (input) input.value = "Default Project";
    
    try {
        await setDoc(doc(db, "projects", currentProjectId), { name: "Default Project" }, { merge: true });
        if (modal) modal.remove();
    } catch (e) {
        console.error("Error resetting name:", e);
        alert("Failed to reset name.");
        if (modal) modal.remove();
    }
}

window.filterProjectList = function(term) {
    const container = document.getElementById('project-list-container');
    if (!container) return;
    const cards = container.querySelectorAll('.card');
    const lowerTerm = term.toLowerCase();
    
    cards.forEach(card => {
        const titleEl = card.querySelector('.card-title');
        if (titleEl) {
            const title = titleEl.textContent.toLowerCase();
            card.style.display = title.includes(lowerTerm) ? 'flex' : 'none';
        }
    });
}

window.openDeleteProjectModal = function(projectId, projectName) {
    const modalId = 'delete-project-modal';
    const existing = document.getElementById(modalId);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal-overlay';
    modal.style.zIndex = '3000';

    const card = document.createElement('div');
    card.className = 'modal-card';
    card.style.maxWidth = '400px';
    card.style.animation = 'fadeIn 0.2s ease-out';

    card.innerHTML = `
        <div class="modal-header" style="border-bottom:none; padding-bottom:0;">
            <span class="card-title" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> Delete Project</span>
            <i class="fas fa-times" style="cursor:pointer" onclick="document.getElementById('${modalId}').remove()"></i>
        </div>
        <div class="modal-body" style="text-align:center; padding-top:0;">
            <div style="font-size:3rem; color:#ef4444; margin:1rem 0; opacity:0.2"><i class="fas fa-trash-alt"></i></div>
            <h3 style="margin-bottom:0.5rem; color:var(--text-main);">Are you sure?</h3>
            <p style="color:var(--text-muted); font-size:0.9rem; margin-bottom:1.5rem; line-height:1.5;">
                You are about to permanently delete <strong>"${escapeHtml(projectName)}"</strong>.<br>This action cannot be undone.
            </p>
            <div style="display:flex; gap:10px; justify-content:center; width:100%;">
                <button onclick="document.getElementById('${modalId}').remove()" style="flex:1; padding:0.75rem; border:1px solid var(--border); background:transparent; border-radius:0.5rem; cursor:pointer; font-weight:600; color:var(--text-main);">Cancel</button>
                <button onclick="performProjectDeletion('${projectId}')" style="flex:1; padding:0.75rem; border:none; background:#ef4444; color:white; border-radius:0.5rem; cursor:pointer; font-weight:600; box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);">Delete</button>
            </div>
        </div>
    `;

    modal.appendChild(card);
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    document.body.appendChild(modal);
}

window.performProjectDeletion = async function(projectId) {
    const modal = document.getElementById('delete-project-modal');
    const btn = modal ? modal.querySelector('button[onclick^="performProjectDeletion"]') : null;
    
    if (btn) {
        btn.textContent = 'Deleting...';
        btn.disabled = true;
    }

    if (projectId === currentProjectId) {
        switchProject('default');
    }

    try {
        await deleteDoc(doc(db, "projects", projectId));
        
        if (modal) modal.remove();

        if (showProjectOverview && projectId !== currentProjectId) {
             const panel = document.getElementById('workspaceContent') || document.getElementById('mainPanel');
             renderProjectOverview(panel);
        }
    } catch (e) {
        console.error("Error deleting project:", e);
        alert("Failed to delete project.");
        if (modal) modal.remove();
    }
}
