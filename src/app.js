import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCPRWLcB9BODRYcZBkfCTBA7N78OQDhaKo",
  authDomain: "bim-collab.firebaseapp.com",
  projectId: "bim-collab",
  storageBucket: "bim-collab.firebasestorage.app",
  messagingSenderId: "20536267192",
  appId: "1:20536267192:web:58510a149f6d36975bbf4d",
  measurementId: "G-Y6Z79DHLXK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storageService = getStorage(app);
const auth = getAuth(app);

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
            architect: { name: "Big Bro Kele Architect", icon: "fa-pen-ruler" },
            engineer: { name: "Mike Engineer", icon: "fa-hard-hat" },
            contractor: { name: "John Contractor", icon: "fa-truck" },
            quantity: { name: "Emily Surveyor", icon: "fa-calculator" },
            owner: { name: "David Owner", icon: "fa-user-tie" }
        };
        
        const storage = {};
        const files = {};
        const viewerStates = {};
        const typingTimers = {};
        const replyStates = {};
        let lastSendTime = 0;
        let cryptoKey = null;

        // Firebase Unsubscribe functions
        let unsubscribeMessages = null;
        let unsubscribeFiles = null;

        projectStages.forEach(s => {
            storage[s.id] = { c1: [], c2: [] };
            files[s.id] = { v1: [], v2: [] };
        });

signInAnonymously(auth).catch((error) => {
    console.error("Auth failed. Ensure Anonymous Auth is enabled in Firebase Console:", error);
});

onAuthStateChanged(auth, (user) => {
    if (user) setupFirebaseListeners(activeStageId);
});

        window.initStages = function() {
            const list = document.getElementById('stageList');
            list.innerHTML = projectStages.map((s) => `
                <div class="stage ${s.id === activeStageId ? 'active' : ''}" id="nav-${s.id}" onclick="switchStage('${s.id}')">
                    <span class="stage-title">${s.title}</span>
                    <span class="stage-subtitle">${s.sub}</span>
                </div>
            `).join('');
        }

        window.switchStage = function(id) {
            activeStageId = id;
            document.querySelectorAll('.stage').forEach(el => el.classList.remove('active'));
            const activeNav = document.getElementById(`nav-${id}`);
            if (activeNav) activeNav.classList.add('active');
            
            setupFirebaseListeners(id);
            
            if (currentRole) renderWorkspace();
        }

        function setupFirebaseListeners(stageId) {
            if (unsubscribeMessages) unsubscribeMessages();
            if (unsubscribeFiles) unsubscribeFiles();

            // Listen for Messages
            const qMsg = query(collection(db, "messages"), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
            unsubscribeMessages = onSnapshot(qMsg, (snapshot) => {
                // Reset local cache for this stage
                storage[stageId] = { c1: [], c2: [] };
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (storage[stageId][data.chatId]) {
                        storage[stageId][data.chatId].push({
                            id: doc.id, // Store doc ID for deletion/editing
                            ...data,
                            time: data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'
                        });
                    }
                });
                loadStageData();
            }, (error) => {
                console.error("Error listening to messages:", error);
                if (error.code === 'permission-denied') console.warn("Ensure Firestore Rules are deployed.");
            });

            // Listen for Files
            const qFiles = query(collection(db, "files"), where("stageId", "==", stageId), orderBy("timestamp", "asc"));
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
        }

        document.getElementById('roleSelect').onchange = (e) => {
            currentRole = e.target.value;
            renderWorkspace();
            toggleLogoutButtons(true);
            
            const sidebarRole = document.getElementById('sidebarRoleDisplay');
            const sidebarName = document.getElementById('profileNameDisplay');
            const sidebarIcon = document.getElementById('profileAvatarIcon');

            if (sidebarRole) sidebarRole.textContent = currentRole;
            if (roleProfiles[currentRole]) {
                if (sidebarName) sidebarName.textContent = roleProfiles[currentRole].name;
                if (sidebarIcon) sidebarIcon.className = `fas ${roleProfiles[currentRole].icon}`;
            }
        };

        window.logout = function() {
            if (!confirm('Are you sure you want to logout?')) return;
            
            currentRole = null;
            document.getElementById('roleSelect').value = "";
            
            const sidebarRole = document.getElementById('sidebarRoleDisplay');
            const sidebarName = document.getElementById('profileNameDisplay');
            const sidebarIcon = document.getElementById('profileAvatarIcon');

            if (sidebarRole) sidebarRole.textContent = "No Role Selected";
            if (sidebarName) sidebarName.textContent = "Guest User";
            if (sidebarIcon) sidebarIcon.className = "fas fa-user";

            toggleLogoutButtons(false);
            renderWorkspace();
            
            // Close sidebar if open
            const mobileSidebar = document.getElementById('mobileSidebar');
            const sidebarOverlay = document.getElementById('sidebarOverlay');
            if (mobileSidebar) mobileSidebar.classList.remove('open');
            if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        };

        function toggleLogoutButtons(show) {
            const btns = document.querySelectorAll('#headerLogoutBtn, .sidebar-logout-btn');
            btns.forEach(btn => btn.style.display = show ? 'flex' : 'none');
        }

        window.renderWorkspace = function() {
            const panel = document.getElementById('mainPanel');
            
            // Engineer and Contractor see a restricted UI
            const isRestricted = (currentRole === 'engineer' || currentRole === 'contractor');

            if (isRestricted) {
                panel.innerHTML = `
                    <div class="dashboard-grid grid-1-only">
                        ${viewerNode('v1', 'Project View')}
                        ${chatNode('c1', 'Main Stream', 'v1')}
                    </div>
                `;
            } else {
                panel.innerHTML = `
                    <div class="dashboard-grid grid-2">
                        ${viewerNode('v1', 'Project View')}
                        ${viewerNode('v2', 'Secondary View')}
                        ${chatNode('c1', 'Main Stream', 'v1')}
                        ${chatNode('c2', 'Private Channel', 'v2')}
                    </div>
                `;
            }
            loadStageData();
        }

        window.viewerNode = function(id, title) {
            if (!viewerStates[id]) viewerStates[id] = { zoom: 1, rot: 0 };
            
            let toolbarStyle = "";

            return `
                <div class="card">
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

        window.chatNode = function(id, title, vId) {
            const currentStageObj = projectStages.find(s => s.id === activeStageId);
            const stageName = currentStageObj ? currentStageObj.title : activeStageId;

            return `
                <div class="card" ondragover="handleDragOver(event)" ondragenter="highlight(event)" ondragleave="unhighlight(event)" ondrop="handleDrop(event, '${id}', '${vId}')">
                    <div class="card-header">
                        <span class="card-title">
                            ${title}
                            <span id="file-count-${id}" onclick="viewAllFiles('${id}', '${vId}')" style="cursor:pointer; font-size:0.6rem; background:var(--primary); color:white; padding:1px 6px; border-radius:10px; margin-left:6px; vertical-align:middle; display:none"></span>
                        </span>
                        <input type="text" id="search-${id}" placeholder="Search..." 
                            class="search-input"
                            oninput="loadStageData()">
                    </div>
                    <div class="chat-container" id="chat-box-${id}"></div>
                    <div id="typing-${id}" style="height: 15px; font-size: 0.7rem; color: #888; padding-left: 10px; font-style: italic;"></div>
                    <div id="reply-preview-${id}" style="font-size: 0.7rem; color: var(--primary); padding-left: 10px; display:none; margin-bottom: 5px;"></div>
                    <div id="progress-container-${id}" style="display:none; padding: 0 10px; margin-bottom: 5px;">
                        <div style="height: 4px; background: #eee; border-radius: 2px; overflow: hidden;">
                            <div id="progress-bar-${id}" style="height: 100%; width: 0%; background: var(--primary); transition: width 0.1s;"></div>
                        </div>
                    </div>
                    <div class="chat-input-area">
                        <label style="cursor:pointer; color:var(--primary)">
                            <i class="fas fa-paperclip"></i>
                            <input type="file" multiple style="display:none" onchange="handleFile('${id}', '${vId}', this)">
                        </label>
                        <input type="text" id="input-${id}" placeholder="Message in ${stageName}..." oninput="handleTyping('${id}')" onkeypress="if(event.key==='Enter') send('${id}')">
                        <button onclick="send('${id}')" class="send-btn"><i class="fas fa-paper-plane"></i></button>
                    </div>
                </div>
            `;
        }

        window.loadStageData = async function() {
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
                for (let i = 0; i < messages.length; i++) {
                    const m = messages[i];
                    let displayText = m.text;
                    if (m.isEncrypted) displayText = await decryptData(m.text);

                    if (term && !displayText.toLowerCase().includes(term) && !m.user.toLowerCase().includes(term)) continue;

                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'message';

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

                    if (m.user === currentRole) {
                        const delBtn = document.createElement('i');
                        delBtn.className = 'fas fa-trash';
                        delBtn.style.float = 'right';
                        delBtn.style.cursor = 'pointer';
                        delBtn.style.opacity = '0.3';
                        delBtn.onmouseover = () => delBtn.style.opacity = '1';
                        delBtn.onmouseout = () => delBtn.style.opacity = '0.3';
                        delBtn.onclick = () => deleteMessage(chatId, m.id);
                        msgDiv.appendChild(delBtn);

                        const editBtn = document.createElement('i');
                        editBtn.className = 'fas fa-edit';
                        editBtn.style.float = 'right';
                        editBtn.style.cursor = 'pointer';
                        editBtn.style.opacity = '0.3';
                        editBtn.style.marginRight = '10px';
                        editBtn.onmouseover = () => editBtn.style.opacity = '1';
                        editBtn.onmouseout = () => editBtn.style.opacity = '0.3';
                        editBtn.onclick = () => editMessage(chatId, m.id, i);
                        msgDiv.appendChild(editBtn);
                    }

                    const replyBtn = document.createElement('i');
                    replyBtn.className = 'fas fa-reply';
                    replyBtn.style.float = 'right';
                    replyBtn.style.cursor = 'pointer';
                    replyBtn.style.opacity = '0.3';
                    replyBtn.style.marginRight = '10px';
                    replyBtn.onmouseover = () => replyBtn.style.opacity = '1';
                    replyBtn.onmouseout = () => replyBtn.style.opacity = '0.3';
                    replyBtn.onclick = () => replyMessage(chatId, i);
                    msgDiv.appendChild(replyBtn);

                    if (m.time) {
                        const timeSpan = document.createElement('span');
                        timeSpan.style.fontSize = '0.7rem';
                        timeSpan.style.opacity = '0.5';
                        timeSpan.style.marginRight = '5px';
                        timeSpan.textContent = m.time;
                        msgDiv.appendChild(timeSpan);
                    }
                    const userStrong = document.createElement('strong');
                    userStrong.textContent = m.user.toUpperCase();
                    msgDiv.appendChild(userStrong);
                    msgDiv.appendChild(document.createTextNode(`: ${displayText}`));
                    box.appendChild(msgDiv);
                }
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

        window.send = async function(chatId) {
            const now = Date.now();
            if (now - lastSendTime < 500) {
                return;
            }
            lastSendTime = now;

            const input = document.getElementById(`input-${chatId}`);
            if(!input.value.trim()) return;
        const encryptedText = await encryptData(input.value);
        const msg = { 
            user: currentRole, 
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
            
            input.value = "";
            
            const typingEl = document.getElementById(`typing-${chatId}`);
            if (typingEl) typingEl.textContent = '';
            if (typingTimers[chatId]) clearTimeout(typingTimers[chatId]);
        }

        window.deleteMessage = async function(chatId, msgId) {
            if (confirm('Are you sure you want to delete this message?')) {
                await deleteDoc(doc(db, "messages", msgId));
            }
        }

        window.editMessage = async function(chatId, msgId, index) {
            const msg = storage[activeStageId][chatId][index];
            if (msg.user !== currentRole) return;
            let currentText = msg.isEncrypted ? await decryptData(msg.text) : msg.text;
            const newText = prompt('Edit message:', currentText);
            if (newText !== null && newText.trim() !== "") {
                const encrypted = await encryptData(newText.trim());
                await updateDoc(doc(db, "messages", msgId), {
                    text: encrypted,
                    isEncrypted: true
                });
            }
        }

        window.handleTyping = function(chatId) {
            const typingEl = document.getElementById(`typing-${chatId}`);
            if (!typingEl) return;
            
            const user = currentRole ? currentRole.toUpperCase() : 'USER';
            typingEl.textContent = `${user} is typing...`;
            
            if (typingTimers[chatId]) clearTimeout(typingTimers[chatId]);
            
            typingTimers[chatId] = setTimeout(() => {
                typingEl.textContent = '';
            }, 1000);
        }

        window.replyMessage = async function(chatId, index) {
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

        window.cancelReply = function(chatId) {
            delete replyStates[chatId];
            const preview = document.getElementById(`reply-preview-${chatId}`);
            if (preview) {
                preview.style.display = 'none';
                preview.innerHTML = '';
            }
        }

        window.handleDragOver = function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }

        window.highlight = function(e) {
            e.preventDefault();
            e.currentTarget.style.border = '2px dashed var(--primary)';
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
        }

        window.unhighlight = function(e) {
            if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
            e.currentTarget.style.border = '';
            e.currentTarget.style.backgroundColor = '';
        }

        window.handleDrop = function(event, chatId, vId) {
            event.preventDefault();
            event.currentTarget.style.border = '';
            event.currentTarget.style.backgroundColor = '';
            if (event.dataTransfer.files.length > 0) {
                handleFile(chatId, vId, event.dataTransfer);
            }
        }

        window.handleFile = async function(chatId, vId, input) {
            const filesList = input.files ? Array.from(input.files) : [input];
            if (filesList.length === 0) return;

            const pContainer = document.getElementById(`progress-container-${chatId}`);
            const pBar = document.getElementById(`progress-bar-${chatId}`);

            const uploadedNames = [];

            let i = 0;
            if (pContainer) pContainer.style.display = 'block';

            for (const file of filesList) {
                const storageRef = ref(storageService, `files/${activeStageId}/${vId}/${Date.now()}_${file.name}`);
                
                // Simple progress simulation since uploadBytes doesn't provide stream in this context easily without Resumable
                if (pBar) pBar.style.width = '50%';
                
                const snapshot = await uploadBytes(storageRef, file);
                const url = await getDownloadURL(snapshot.ref);
                
                if (pBar) pBar.style.width = '100%';

                await addDoc(collection(db, "files"), {
                    stageId: activeStageId,
                    viewId: vId,
                    name: file.name,
                    url: url,
                    storagePath: snapshot.ref.fullPath,
                    timestamp: serverTimestamp()
                });

                uploadedNames.push(file.name);
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

        window.setViewer = function(vId, url, name) {
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

        window.zoom = function(id, delta) {
            const el = document.getElementById(`img-${id}`);
            if(!el) return;
            viewerStates[id].zoom = Math.max(0.1, viewerStates[id].zoom + delta);
            el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
        }

        window.rotate = function(id, delta) {
            const el = document.getElementById(`img-${id}`);
            if(!el) return;
            viewerStates[id].rot += 90;
            el.style.transform = `scale(${viewerStates[id].zoom}) rotate(${viewerStates[id].rot}deg)`;
        }

        window.resetViewer = function(id) {
            const el = document.getElementById(`img-${id}`);
            if(!el) return;
            viewerStates[id].zoom = 1;
            viewerStates[id].rot = 0;
            el.style.transform = `scale(1) rotate(0deg)`;
        }

        window.setVolume = function(id, val) {
            const el = document.getElementById(`img-${id}`);
            if (el && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
                el.volume = val;
            }
        }

        window.toggleOrbit = function(id) {
            const el = document.getElementById(`img-${id}`);
            if (el && el.tagName === 'MODEL-VIEWER') {
                if (el.hasAttribute('auto-rotate')) {
                    el.removeAttribute('auto-rotate');
                } else {
                    el.setAttribute('auto-rotate', '');
                }
            }
        }

        window.toggleFullscreen = function(id) {
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

        window.downloadAll = function(vId) {
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

        window.viewAllFiles = function(chatId, vId) {
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

        window.openContactModal = function(e) {
            if (e) e.preventDefault();
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
                <form onsubmit="event.preventDefault(); const email = this.querySelector('input[type=email]').value; const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/; if (!emailRegex.test(email)) { alert('Please enter a valid email address.'); return; } this.style.display='none'; document.getElementById('success-msg').style.display='flex'; setTimeout(() => document.getElementById('${modalId}').remove(), 3000);" style="display:flex; flex-direction:column; gap:1rem;">
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
                <div id="success-msg" style="display:none; flex-direction:column; align-items:center; justify-content:center; padding:2rem 0; text-align:center; animation: fadeIn 0.5s ease-out;">
                    <i class="fas fa-check-circle" style="font-size:4rem; color:#10b981; margin-bottom:1rem;"></i>
                    <h3 style="margin-bottom:0.5rem; color:var(--text-main)">Message Sent!</h3>
                    <p style="color:var(--text-muted)">We'll get back to you shortly.</p>
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
            
            await initEncryption();

            const script = document.createElement('script');
            script.type = 'module';
            script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
            document.body.appendChild(script);

            window.scrollTo(0, 0);
            initStages();

            const footer = document.createElement('footer');
            footer.className = 'footer';
            footer.innerHTML = `
                <span>OJ Evolve @2025</span>
                <span style="opacity:0.5">|</span>
                <a href="#" onclick="openContactModal(event)" style="color:white; text-decoration:underline">Contact Us</a>
                <span style="opacity:0.5">|</span>
                <a href="#" style="color:white; text-decoration:underline">Privacy Policy</a>
            `;
            document.body.appendChild(footer);

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
            });
        };

        async function initEncryption() {
            cryptoKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
            );
        }

        async function encryptData(text) {
            const enc = new TextEncoder();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                cryptoKey,
                enc.encode(text)
            );
            return { iv: Array.from(iv), data: Array.from(new Uint8Array(ciphertext)) };
        }

        async function decryptData(cipherObj) {
            try {
                const iv = new Uint8Array(cipherObj.iv);
                const data = new Uint8Array(cipherObj.data);
                const decrypted = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: iv },
                    cryptoKey,
                    data
                );
                return new TextDecoder().decode(decrypted);
            } catch (e) {
                return "[Encrypted]";
            }
        }