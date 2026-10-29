/**
 * app.js - Enrutador y Controlador Principal de la Aplicación
 * Administra el ciclo de vida de la SPA, enrutamiento, dashboard, notificaciones, búsqueda global y listeners.
 */

(function() {
    // =====================================================
    // NAVEGACIÓN Y ACCESO SPA
    // =====================================================
    function navigateTo(viewId) {
        const currentUser = window.auth.getCurrentUser();
        
        // Redirigir a login si no hay sesión iniciada (excepto si ya va a login)
        if (!currentUser && !['view-login', 'view-home', 'view-register'].includes(viewId)) {
            navigateTo('view-login');
            return;
        }

        // Si ya está logueado e intenta ir a una vista pública, enviarlo al dashboard
        if (currentUser && ['view-login', 'view-home', 'view-register'].includes(viewId)) {
            navigateTo(currentUser.role === 'USUARIO' ? 'view-client-portal' : 'view-dashboard');
            return;
        }

        // Control de permisos por rol antes de ingresar a la vista
        if (currentUser) {
            if (viewId === 'view-client-portal' && currentUser.role !== 'USUARIO') {
                showToast('El portal de solicitantes es exclusivo para cuentas de usuario.', 'error');
                navigateTo('view-dashboard');
                return;
            }
            if (currentUser.role === 'USUARIO' && viewId !== 'view-client-portal') {
                showToast('Tu cuenta solo puede consultar sus propias solicitudes.', 'error');
                navigateTo('view-client-portal');
                return;
            }

            const roleRestrictions = {
                'view-audit': ['ADMINISTRADOR'],
                'view-users': ['ADMINISTRADOR'],
                'view-templates-new': ['ADMINISTRADOR'],
                'view-notary-revision': ['NOTARIO', 'ADMINISTRADOR']
            };

            const allowedRoles = roleRestrictions[viewId];
            if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
                showToast(`❌ Acceso denegado: Tu rol (${currentUser.role}) no tiene autorización para esta vista.`, 'error');
                // Mantener en el dashboard
                navigateTo('view-dashboard');
                return;
            }
        }

        // Ocultar todas las vistas y remover clases activas de menú
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));

        // Mostrar vista destino
        const targetView = document.getElementById(viewId);
        if (targetView) targetView.classList.add('active');

        // Marcar botón activo en sidebar
        const menuItem = document.querySelector(`.menu-item[data-target="${viewId}"]`);
        if (menuItem) menuItem.classList.add('active');

        // Acciones al entrar a cada vista específica
        if (viewId === 'view-dashboard') renderDashboard();
        if (viewId === 'view-client-portal') renderClientPortal();
        if (viewId === 'view-clients') window.clients.renderList();
        if (viewId === 'view-procedures') {
            window.procedures.populateSelectors();
            window.procedures.renderList();
        }
        if (viewId === 'view-procedures-new') {
            window.procedures.populateSelectors();
        }
        if (viewId === 'view-templates') window.templates.renderList();
        if (viewId === 'view-templates-new') window.templates.populateDocTypes();
        if (viewId === 'view-notary-revision') window.documents.renderRevisionList();
        if (viewId === 'view-audit') window.audit.renderList();
        if (viewId === 'view-assistant') initAssistantView();
        if (viewId === 'view-notifications') renderNotificationsView();
        if (viewId === 'view-users') renderUsersView();
        if (viewId === 'view-settings') renderSettingsView();

        // Cerrar sidebar en móviles
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && window.innerWidth <= 768) {
            sidebar.classList.remove('open');
        }
        
        // Volver arriba al cambiar de pestaña
        window.scrollTo(0, 0);
    }

    // =====================================================
    // ACTUALIZACIÓN DE INTERFAZ SEGÚN ROL
    // =====================================================
    function updateUIVisibility() {
        const currentUser = window.auth.getCurrentUser();
        const appContainer = document.querySelector('.app-container');
        
        if (!currentUser) {
            if (appContainer) appContainer.classList.add('login-mode');
            document.querySelectorAll('.sidebar-menu .menu-item, .debug-role-container, .header-search, .header-btn[title="Notificaciones"], .sidebar-footer [data-target="view-settings"]')
                .forEach(element => element.classList.remove('hidden'));
            return;
        }

        if (appContainer) appContainer.classList.remove('login-mode');

        // Llenar datos de perfil en el footer del sidebar
        const userNameEl = document.querySelector('.user-name');
        const userRoleEl = document.querySelector('.user-role');
        const avatarEl = document.querySelector('.avatar');

        if (userNameEl) userNameEl.textContent = currentUser.fullname;
        if (userRoleEl) userRoleEl.textContent = currentUser.role;
        if (avatarEl) {
            // Iniciales
            const parts = currentUser.fullname.split(' ');
            const initials = parts.map(p => p.charAt(0)).join('').substring(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }

        // Mostrar / Ocultar menús según rol
        const menuItems = document.querySelectorAll('.sidebar-menu .menu-item[data-target]');
        menuItems.forEach(item => {
            const target = item.dataset.target;

            if (currentUser.role === 'USUARIO') {
                item.classList.toggle('hidden', target !== 'view-client-portal');
            } else if (target === 'view-client-portal') {
                item.classList.add('hidden');
            } else if (target === 'view-audit' || target === 'view-users') {
                item.classList.toggle('hidden', currentUser.role !== 'ADMINISTRADOR');
            } else if (target === 'view-notary-revision') {
                item.classList.toggle('hidden', currentUser.role !== 'NOTARIO' && currentUser.role !== 'ADMINISTRADOR');
            } else {
                item.classList.remove('hidden');
            }
        });

        const isApplicant = currentUser.role === 'USUARIO';
        const canUseDebugRole = currentUser.role === 'ADMINISTRADOR' || currentUser.debugAccess === true;
        document.querySelector('.debug-role-container')?.classList.toggle('hidden', !canUseDebugRole);
        document.querySelector('.header-search')?.classList.toggle('hidden', isApplicant);
        document.querySelector('.header-btn[title="Notificaciones"]')?.classList.toggle('hidden', isApplicant);
        document.querySelector('.sidebar-footer [data-target="view-settings"]')?.classList.toggle('hidden', isApplicant);

        // Actualizar contador de notificaciones pendientes
        updateNotificationCount();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function renderClientPortal() {
        const currentUser = window.auth.getCurrentUser();
        const body = document.getElementById('client-portal-procedures-body');
        if (!currentUser || currentUser.role !== 'USUARIO' || !body) return;

        const procedures = currentUser.clientId
            ? window.db.getCollection('procedures').filter(procedure => procedure.clientId == currentUser.clientId)
            : [];

        if (procedures.length === 0) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-secondary">
                        Aún no hay solicitudes asociadas a esta cuenta. En este prototipo, el personal debe registrar el trámite para el cliente.
                    </td>
                </tr>`;
            return;
        }

        const documentTypes = window.db.getCollection('document_types');
        const documents = window.db.getCollection('documents');
        body.innerHTML = procedures.map(procedure => {
            const type = documentTypes.find(item => item.id == procedure.typeId);
            const doc = documents.find(item => item.procedureId == procedure.id && item.status === 'aprobado');
            const date = procedure.date ? new Date(procedure.date).toLocaleDateString('es-EC') : 'N/D';
            return `
                <tr>
                    <td><strong>${escapeHtml(procedure.code || 'N/D')}</strong></td>
                    <td>${escapeHtml(type?.name || 'Trámite notarial')}</td>
                    <td>${escapeHtml(date)}</td>
                    <td><span class="badge ${getStatusClass(procedure.status)}">${escapeHtml(procedure.status || 'Pendiente')}</span></td>
                    <td>${doc
                        ? `<button class="btn btn-secondary btn-sm" onclick="app.downloadClientDocument(${Number(doc.id)}, 'word')">Descargar Word</button>
                           <button class="btn btn-secondary btn-sm" onclick="app.downloadClientDocument(${Number(doc.id)}, 'pdf')">Descargar PDF</button>`
                        : '<span class="text-muted">Disponible al aprobarse</span>'}
                    </td>
                </tr>`;
        }).join('');
    }

    function downloadClientDocument(documentId, format = 'word') {
        const currentUser = window.auth.getCurrentUser();
        const doc = window.db.findById('documents', documentId);
        if (!currentUser || currentUser.role !== 'USUARIO' || !doc || doc.status !== 'aprobado') {
            showToast('El documento no está disponible para esta cuenta.', 'error');
            return;
        }
        const procedure = window.db.findById('procedures', doc.procedureId);
        if (!procedure || procedure.clientId != currentUser.clientId) {
            showToast('No se encontró un documento aprobado asociado a esta cuenta.', 'error');
            return;
        }
        if (format === 'pdf') {
            window.documents.downloadPDF(doc.id);
            return;
        }
        window.documents.downloadWord(doc.id);
    }

    // =====================================================
    // RENDERIZADO DEL DASHBOARD
    // =====================================================
    function renderDashboard() {
        const currentUser = window.auth.getCurrentUser();
        if (!currentUser) return;

        // Actualizar saludo de bienvenida
        const welcomeText = document.querySelector('.welcome-text h1');
        if (welcomeText) {
            welcomeText.textContent = `¡Hola de nuevo, ${currentUser.fullname.split(' ')[0]}!`;
        }

        // Cargar colecciones
        const procedures = window.db.getCollection('procedures');
        const documents = window.db.getCollection('documents');
        const clients = window.db.getCollection('clients');
        const auditLogs = window.db.getCollection('audit_logs');

        // 1. Calcular estadísticas de tarjetas
        const totalProcedures = procedures.length;
        const pendingProcedures = procedures.filter(p => ['Pendiente', 'En proceso', 'Rechazado'].includes(p.status)).length;
        const totalDocs = documents.length;
        const pendingReviewDocs = documents.filter(d => d.status === 'revision').length;

        // Escribir en las tarjetas
        document.getElementById('dash-stat-total-procedures').textContent = totalProcedures;
        document.getElementById('dash-stat-pending-procedures').textContent = pendingProcedures;
        document.getElementById('dash-stat-generated-docs').textContent = totalDocs;
        document.getElementById('dash-stat-pending-review').textContent = pendingReviewDocs;

        // Ocultar botón "Nuevo Trámite" para el Notario en el Dashboard
        const newProcBtn = document.getElementById('dash-btn-new-procedure');
        if (newProcBtn) {
            newProcBtn.classList.toggle('hidden', currentUser.role === 'NOTARIO');
        }

        // 2. Gráfico 1: Trámites por Estado (Render de Barras CSS)
        const statesList = ['Pendiente', 'En proceso', 'Borrador generado', 'En revisión', 'Aprobado', 'Rechazado', 'Finalizado'];
        const stateCounts = statesList.map(st => procedures.filter(p => p.status === st).length);
        const maxCount = Math.max(...stateCounts, 1); // Evitar división por cero

        const chartStatus = document.getElementById('chart-procedures-status');
        if (chartStatus) {
            chartStatus.innerHTML = statesList.map((st, i) => {
                const count = stateCounts[i];
                const pct = (count / maxCount) * 100;
                const badgeClass = getStatusClass(st);
                return `
                    <div class="chart-bar-row">
                        <span class="chart-bar-label">${st}</span>
                        <div class="chart-bar-container">
                            <div class="chart-bar-fill ${badgeClass}" style="width: ${pct}%;"></div>
                        </div>
                        <span class="chart-bar-value">${count}</span>
                    </div>
                `;
            }).join('');
        }

        // 3. Gráfico 2: Documentos por Tipo (Dona SVG dinámica o lista de progreso)
        const docTypes = window.db.getCollection('document_types');
        const typeCounts = docTypes.map(dt => {
            // Contar trámites de este tipo
            const count = procedures.filter(p => p.typeId == dt.id).length;
            return { name: dt.name, count };
        });

        const chartTypes = document.getElementById('chart-documents-types');
        if (chartTypes) {
            const totalCount = typeCounts.reduce((sum, item) => sum + item.count, 0) || 1;
            chartTypes.innerHTML = typeCounts.map(tc => {
                const pct = Math.round((tc.count / totalCount) * 100);
                return `
                    <div style="margin-bottom: 0.75rem;">
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom: 2px;">
                            <span class="text-secondary">${tc.name}</span>
                            <strong>${tc.count} (${pct}%)</strong>
                        </div>
                        <div style="background: var(--border-color); height: 6px; border-radius: 3px; overflow:hidden;">
                            <div style="background: var(--accent-secondary); width: ${pct}%; height: 100%; border-radius: 3px;"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 4. Actividad Reciente (Logs de Auditoría recientes)
        const recentActivity = document.getElementById('dashboard-recent-activity');
        if (recentActivity) {
            // Tomar las últimas 5 actividades
            const recent = [...auditLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
            
            if (recent.length === 0) {
                recentActivity.innerHTML = `<div class="empty-state small"><p>No se registran actividades recientes.</p></div>`;
            } else {
                recentActivity.innerHTML = recent.map(log => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                    const badgeClass = window.audit.getActionBadgeClass(log.action);
                    return `
                        <div class="activity-item">
                            <div class="activity-time">${timeStr}</div>
                            <div class="activity-info">
                                <strong>${log.username}</strong>
                                <span>${log.details}</span>
                            </div>
                            <span class="badge ${badgeClass}" style="font-size:0.7rem;">${log.action}</span>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // =====================================================
    // RENDERIZADO DE NOTIFICACIONES Y CONTADOR
    // =====================================================
    function updateNotificationCount() {
        const currentUser = window.auth.getCurrentUser();
        if (!currentUser) return;

        const countBadge = document.getElementById('notification-badge');
        if (countBadge) {
            const allNotifs = window.db.getCollection('notifications');
            const unread = allNotifs.filter(n => n.userId == currentUser.id && !n.read).length;
            
            if (unread > 0) {
                countBadge.textContent = unread;
                countBadge.classList.remove('hidden');
            } else {
                countBadge.classList.add('hidden');
            }
        }
    }

    function renderNotificationsView() {
        const currentUser = window.auth.getCurrentUser();
        if (!currentUser) return;

        const list = document.getElementById('notifications-list-container');
        if (!list) return;

        const allNotifs = window.db.getCollection('notifications');
        const userNotifs = allNotifs.filter(n => n.userId == currentUser.id);

        if (userNotifs.length === 0) {
            list.innerHTML = `<div class="empty-state"><p>No tienes notificaciones en tu buzón.</p></div>`;
            return;
        }

        // Ordenar más recientes primero
        userNotifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        list.innerHTML = `
            <div style="text-align: right; margin-bottom: 1rem;">
                <button class="btn btn-secondary btn-sm" onclick="app.markAllNotificationsRead()">✓ Marcar todas como leídas</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.75rem;">
                ${userNotifs.map(n => `
                    <div class="card notification-card ${n.read ? 'read' : 'unread'}">
                        <div class="notification-dot"></div>
                        <div style="flex-grow:1;">
                            <p class="notification-text">${n.message}</p>
                            <span class="notification-time">${new Date(n.createdAt).toLocaleString('es-ES')}</span>
                        </div>
                        ${!n.read ? `<button class="btn btn-text btn-sm" onclick="app.markNotificationRead(${n.id})" title="Marcar como leída">✓</button>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function markNotificationRead(id) {
        window.db.update('notifications', id, { read: true });
        showToast('Notificación marcada como leída.', 'info');
        renderNotificationsView();
        updateNotificationCount();
    }

    function markAllNotificationsRead() {
        const currentUser = window.auth.getCurrentUser();
        if (!currentUser) return;

        const allNotifs = window.db.getCollection('notifications');
        allNotifs.forEach(n => {
            if (n.userId == currentUser.id && !n.read) {
                window.db.update('notifications', n.id, { read: true });
            }
        });

        showToast('Todas las notificaciones marcadas como leídas.', 'success');
        renderNotificationsView();
        updateNotificationCount();
    }

    // =====================================================
    // MÓDULO DE USUARIOS (CRUD simple para Administrador)
    // =====================================================
    function renderUsersView() {
        const list = document.getElementById('users-table-body');
        if (!list) return;

        const allUsers = window.db.getCollection('users');
        list.innerHTML = allUsers.map(u => `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td>${u.fullname}</td>
                <td>
                    <input type="email" id="user-email-${u.id}" value="${u.email || ''}" placeholder="correo@notaria.gob.ec"
                        aria-label="Correo de ${u.fullname}" style="min-width: 190px;">
                    <button class="btn btn-secondary btn-sm" onclick="app.saveUserEmail(${u.id})">Guardar</button>
                </td>
                <td><span class="badge ${window.audit.getRoleBadgeClass(u.role)}">${u.role}</span></td>
                <td><span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">${u.active ? 'Activo' : 'Inactivo'}</span></td>
                <td class="table-actions">
                    <button class="btn btn-text btn-sm" onclick="app.toggleUserStatus(${u.id})">
                        ${u.active ? 'Desactivar' : 'Activar'}
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function saveUserEmail(id) {
        const user = window.db.findById('users', id);
        const input = document.getElementById(`user-email-${id}`);
        if (!user || !input) return;

        const email = input.value.trim();
        if (!email || !input.validity.valid) {
            showToast('Ingrese un correo electrónico válido para este usuario.', 'warning');
            input.focus();
            return;
        }

        window.db.update('users', id, { email });
        showToast(`Correo de ${user.fullname} guardado.`, 'success');
        renderUsersView();
    }

    function toggleUserStatus(id) {
        const u = window.db.findById('users', id);
        if (!u) return;

        const currentUser = window.auth.getCurrentUser();
        if (currentUser.id == id) {
            showToast('❌ No puedes desactivar tu propio usuario administrador.', 'error');
            return;
        }

        const newStatus = !u.active;
        window.db.update('users', id, { active: newStatus });
        
        window.db.insert('audit_logs', {
            userId: currentUser.id,
            username: currentUser.username,
            role: currentUser.role,
            action: 'ESTADO_USUARIO',
            timestamp: new Date().toISOString(),
            details: `Cambió el estado del usuario "${u.username}" a ${newStatus ? 'ACTIVO' : 'INACTIVO'}.`,
            ip: '192.168.10.15'
        });

        showToast(`Usuario ${u.username} ${newStatus ? 'activado' : 'desactivado'}.`, 'success');
        renderUsersView();
    }

    // =====================================================
    // CONFIGURACIÓN DE IA Y GENERAL
    // =====================================================
    function renderSettingsView() {
        const { mode, key } = window.aiService.getAIConfig();
        const modeSelect = document.getElementById('settings-ai-mode');
        const keyInput = document.getElementById('settings-gemini-key');
        const container = document.getElementById('settings-key-container');

        if (modeSelect) modeSelect.value = mode;
        if (keyInput) keyInput.value = key;
        
        if (container) {
            container.classList.toggle('hidden', mode !== 'gemini');
        }
    }

    function saveSettings(event) {
        if (event) event.preventDefault();

        const mode = document.getElementById('settings-ai-mode').value;
        const key = document.getElementById('settings-gemini-key').value.trim();

        if (mode === 'gemini' && !key) {
            showToast('⚠️ Debes ingresar una clave API para utilizar el modo Gemini Real.', 'warning');
            return;
        }

        window.aiService.saveAIConfig(mode, key);
        showToast('✅ Configuración de Inteligencia Artificial guardada.', 'success');
    }

    // =====================================================
    // DETALLE DE TRÁMITE DESDE LAS DIVERSAS VISTAS
    // =====================================================
    function viewProcedureDetail(id) {
        const p = window.db.findById('procedures', id);
        if (!p) return;

        const client = window.db.findById('clients', p.clientId);
        const docType = window.db.findById('document_types', p.typeId);
        
        navigateTo('view-procedures-detail');

        // Cargar campos en ficha
        document.getElementById('p-detail-code').textContent = p.code;
        document.getElementById('p-detail-client').innerHTML = `<a href="#" onclick="clients.viewDetails(${client?.id})">${client ? `${client.surnames} ${client.names} (C.I. ${client.cedula})` : 'N/D'}</a>`;
        document.getElementById('p-detail-type').textContent = docType ? docType.name : 'N/D';
        document.getElementById('p-detail-date').textContent = new Date(p.date).toLocaleDateString('es-ES');
        document.getElementById('p-detail-created').textContent = new Date(p.createdAt).toLocaleDateString('es-ES');
        
        const statusBadge = document.getElementById('p-detail-status');
        if (statusBadge) {
            statusBadge.textContent = p.status;
            statusBadge.className = `badge ${getStatusClass(p.status)}`;
        }

        // Cargar documentos del trámite
        const docsContainer = document.getElementById('p-detail-documents-list');
        if (docsContainer) {
            const docs = window.db.findMany('documents', { procedureId: p.id });
            
            if (docs.length === 0) {
                // Estado del botón condicional
                let actionHtml = '';
                const currentUser = window.auth.getCurrentUser();
                
                if (currentUser && currentUser.role !== 'NOTARIO') {
                    actionHtml = `
                        <p class="text-secondary text-sm mb-4">No se ha generado ningún borrador documental para este trámite aún.</p>
                        <button class="btn btn-primary btn-sm" onclick="app.startAssistantForProcedure(${p.id})">
                            💬 Abrir Asistente IA para generar Borrador
                        </button>
                    `;
                } else {
                    actionHtml = `<p class="text-secondary text-sm">Sin borradores generados por personal notarial.</p>`;
                }
                
                docsContainer.innerHTML = `<div style="padding:1.5rem 0;">${actionHtml}</div>`;
                return;
            }

            docsContainer.innerHTML = docs.map(d => {
                const statusBadgeClass = window.app.getStatusClass(d.status === 'borrador' ? 'Borrador generado' : d.status === 'revision' ? 'En revisión' : d.status === 'aprobado' ? 'Aprobado' : 'Rechazado');
                return `
                    <div class="card" style="margin-bottom: 0.75rem; padding: 1rem; border: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:0.95rem;">${d.title}</strong><br>
                            <span class="badge ${statusBadgeClass}" style="font-size:0.7rem; margin-top:4px;">${d.status.toUpperCase()}</span>
                        </div>
                        <div>
                            <button class="btn btn-secondary btn-sm" onclick="documents.openEditor(${d.id})">📝 Abrir Editor</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function startAssistantForProcedure(id) {
        navigateTo('view-assistant');
        setTimeout(() => {
            const selector = document.getElementById('assistant-procedure-selector');
            if (selector) {
                selector.value = id;
                selector.dispatchEvent(new Event('change'));
            }
        }, 100);
    }

    // =====================================================
    // INTERFAZ DE CHAT (ASISTENTE NOTARIAL IA)
    // =====================================================
    let activeConversationId = null;

    function initAssistantView() {
        const selector = document.getElementById('assistant-procedure-selector');
        if (!selector) return;

        // Llenar selectores con trámites activos de estado Pendiente, En proceso, Rechazado o Borrador generado
        selector.innerHTML = '<option value="">-- Seleccione un Trámite Activo --</option>';
        const procedures = window.db.getCollection('procedures').filter(p => p.status !== 'Finalizado' && p.status !== 'Aprobado');
        const clients = window.db.getCollection('clients');
        const docTypes = window.db.getCollection('document_types');

        procedures.forEach(p => {
            const client = clients.find(c => c.id == p.clientId);
            const docType = docTypes.find(dt => dt.id == p.typeId);
            selector.innerHTML += `<option value="${p.id}">${p.code} - ${client ? client.surnames : 'N/D'} (${docType ? docType.name : 'N/D'})</option>`;
        });

        // Limpiar el chat
        document.getElementById('chat-messages-container').innerHTML = `
            <div class="empty-state" style="padding: 3rem 1rem;">
                <i data-lucide="message-square" style="width: 48px; height: 48px; color: var(--accent-primary); margin-bottom: 1rem;"></i>
                <h3 class="mb-2">Asistente Conversacional Notarial</h3>
                <p class="text-secondary max-w-sm" style="font-size: 0.9rem;">Selecciona un trámite activo del menú superior para iniciar la recopilación inteligente de información.</p>
            </div>
        `;
        lucide.createIcons();

        // Ocultar variables y botón de generación por defecto
        document.getElementById('assistant-variables-panel').classList.add('hidden');
        
        activeConversationId = null;
    }

    function onAssistantProcedureChange(e) {
        const procId = e.target.value;
        const msgContainer = document.getElementById('chat-messages-container');
        const varsPanel = document.getElementById('assistant-variables-panel');
        const generateBtn = document.getElementById('assistant-btn-generate');

        if (!procId) {
            initAssistantView();
            return;
        }

        // Inicializar conversación en BD
        const conv = window.aiService.initConversation(procId);
        if (!conv) {
            e.target.value = '';
            return;
        }

        activeConversationId = conv.id;

        // Mostrar panel de variables a la derecha
        varsPanel.classList.remove('hidden');

        // Renderizar mensajes guardados
        renderChatMessages(conv.id);

        // Renderizar variables guardadas
        renderVariablesStatus(conv.id);

        // Habilitar o deshabilitar botón de generación según estado de conversación
        generateBtn.classList.toggle('hidden', conv.status !== 'completado');
        generateBtn.onclick = () => window.documents.generateDraft(procId);
    }

    function renderChatMessages(convId) {
        const container = document.getElementById('chat-messages-container');
        if (!container) return;

        const messages = window.db.findMany('ai_messages', { conversationId: convId });
        
        if (messages.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>Iniciando...</p></div>`;
            return;
        }

        // Reemplazar saltos de línea con <br> y procesar negritas markdown simples (**texto**)
        function formatMarkdown(text) {
            return text
                .replace(/\n/g, '<br>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
        }

        container.innerHTML = messages.map(m => `
            <div class="chat-message ${m.role === 'assistant' ? 'assistant' : 'user'}">
                <div class="message-bubble">
                    ${formatMarkdown(m.content)}
                </div>
                <div class="message-time">
                    ${new Date(m.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </div>
            </div>
        `).join('');

        // Auto scroll abajo
        container.scrollTop = container.scrollHeight;
    }

    function renderVariablesStatus(convId) {
        const container = document.getElementById('assistant-variables-body');
        if (!container) return;

        const conv = window.db.findById('ai_conversations', convId);
        const p = window.db.findById('procedures', conv.procedureId);
        const template = window.db.findOne('templates', { typeId: p.typeId, active: true });

        if (!conv || !template) return;

        const profileFields = window.aiService.getClientProfileFields();
        const profileRows = profileFields.map(field => {
            const val = conv.variablesCollected[field.key] || 'N/D';
            const isCompleted = val !== 'N/D';
            return `
                <div class="var-status-row ${isCompleted ? 'completed' : 'pending'}">
                    <span class="var-name">${field.label}</span>
                    <span class="var-value" title="${escapeHtml(val)}">${escapeHtml(val)}</span>
                </div>
            `;
        }).join('');
        const templateRows = template.variables.map(v => {
            const val = conv.variablesCollected[v];
            const isCompleted = val !== 'N/D';
            return `
                <div class="var-status-row ${isCompleted ? 'completed' : 'pending'}">
                    <span class="var-name">${escapeHtml(v)}</span>
                    <span class="var-value" title="${escapeHtml(val)}">${escapeHtml(val)}</span>
                </div>
            `;
        }).join('');
        container.innerHTML = `<h4>Datos del cliente</h4>${profileRows}<h4>Datos del trámite</h4>${templateRows}`;
    }

    async function handleChatFormSubmit(event) {
        if (event) event.preventDefault();
        
        if (!activeConversationId) {
            showToast('⚠️ Por favor selecciona un trámite activo primero.', 'warning');
            return;
        }

        const input = document.getElementById('chat-input-text');
        const text = input.value.trim();
        if (!text) return;

        // Limpiar input e inhabilitar temporalmente
        input.value = '';
        input.disabled = true;

        // Renderizar el mensaje escrito por el usuario de inmediato
        const tempContainer = document.getElementById('chat-messages-container');
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'chat-message user';
        userMsgDiv.innerHTML = `
            <div class="message-bubble">${text}</div>
            <div class="message-time">${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        tempContainer.appendChild(userMsgDiv);
        tempContainer.scrollTop = tempContainer.scrollHeight;

        // Mostrar indicador escribiendo
        const typingDiv = document.createElement('div');
        typingDiv.className = 'chat-message assistant typing-indicator-msg';
        typingDiv.innerHTML = `
            <div class="message-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        tempContainer.appendChild(typingDiv);
        tempContainer.scrollTop = tempContainer.scrollHeight;

        try {
            // Enviar a la IA
            const result = await window.aiService.sendMessage(activeConversationId, text);
            
            // Remover indicador escribiendo
            const typingMsg = tempContainer.querySelector('.typing-indicator-msg');
            if (typingMsg) typingMsg.remove();

            if (result) {
                // Renderizar conversación actualizada
                renderChatMessages(activeConversationId);
                // Renderizar variables
                renderVariablesStatus(activeConversationId);
                
                // Mostrar botón generar borrador si terminó
                const generateBtn = document.getElementById('assistant-btn-generate');
                if (generateBtn) {
                    generateBtn.classList.toggle('hidden', !result.finished);
                }
            }
        } catch (e) {
            const typingMsg = tempContainer.querySelector('.typing-indicator-msg');
            if (typingMsg) typingMsg.remove();
            showToast(`❌ Error al enviar mensaje: ${e.message}`, 'error');
        } finally {
            input.disabled = false;
            input.focus();
        }
    }

    // =====================================================
    // BÚSQUEDA GLOBAL
    // =====================================================
    function handleGlobalSearch(e) {
        const query = e.target.value.trim().toLowerCase();
        const resultsBox = document.getElementById('global-search-results');
        
        if (!query) {
            resultsBox.classList.add('hidden');
            return;
        }

        const clients = window.db.getCollection('clients');
        const procedures = window.db.getCollection('procedures');
        const docs = window.db.getCollection('documents');
        const docTypes = window.db.getCollection('document_types');

        // 1. Filtrar Clientes
        const filteredClients = clients.filter(c => 
            c.cedula.includes(query) || 
            c.names.toLowerCase().includes(query) || 
            c.surnames.toLowerCase().includes(query)
        ).slice(0, 3);

        // 2. Filtrar Trámites
        const filteredProcedures = procedures.filter(p => 
            p.code.toLowerCase().includes(query)
        ).slice(0, 3);

        // 3. Filtrar Documentos
        const filteredDocs = docs.filter(d => 
            d.title.toLowerCase().includes(query)
        ).slice(0, 3);

        // Renderizar resultados en el popup
        let html = '';

        if (filteredClients.length === 0 && filteredProcedures.length === 0 && filteredDocs.length === 0) {
            html = `<div class="search-result-group"><p class="text-secondary text-xs p-2">No se encontraron resultados.</p></div>`;
        } else {
            // Clientes
            if (filteredClients.length > 0) {
                html += `
                    <div class="search-result-group">
                        <div class="group-title">👤 Clientes</div>
                        ${filteredClients.map(c => `
                            <div class="result-item" onclick="app.clickSearchResult('client', ${c.id})">
                                <strong>${c.surnames} ${c.names}</strong><br>
                                <span class="text-xs text-muted">C.I. ${c.cedula}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            // Trámites
            if (filteredProcedures.length > 0) {
                html += `
                    <div class="search-result-group">
                        <div class="group-title">📂 Trámites</div>
                        ${filteredProcedures.map(p => {
                            const c = clients.find(cl => cl.id == p.clientId);
                            return `
                                <div class="result-item" onclick="app.clickSearchResult('procedure', ${p.id})">
                                    <strong>${p.code}</strong> - <span class="text-xs badge ${getStatusClass(p.status)}">${p.status}</span><br>
                                    <span class="text-xs text-muted">Solicitante: ${c ? c.surnames : 'N/D'}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }
            // Documentos
            if (filteredDocs.length > 0) {
                html += `
                    <div class="search-result-group">
                        <div class="group-title">📄 Documentos</div>
                        ${filteredDocs.map(d => `
                            <div class="result-item" onclick="app.clickSearchResult('document', ${d.id})">
                                <strong>${d.title}</strong><br>
                                <span class="text-xs badge badge-secondary">${d.status.toUpperCase()}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        resultsBox.innerHTML = html;
        resultsBox.classList.remove('hidden');
    }

    function clickSearchResult(type, id) {
        // Cerrar resultados
        document.getElementById('global-search-results').classList.add('hidden');
        document.getElementById('header-search-input').value = '';

        if (type === 'client') {
            window.clients.viewDetails(id);
        } else if (type === 'procedure') {
            viewProcedureDetail(id);
        } else if (type === 'document') {
            window.documents.openEditor(id);
        }
    }

    // =====================================================
    // LISTENER Y MANEJO DE LOGIN
    // =====================================================
    function handleLoginFormSubmit(event) {
        if (event) event.preventDefault();

        const userVal = document.getElementById('login-username').value.trim();
        const passVal = document.getElementById('login-password').value;

        try {
            const user = window.auth.login(userVal, passVal);
            showToast(`🔑 ¡Bienvenido de nuevo, ${user.fullname}!`, 'success');
            
            // Inicializar UI y navegar
            updateUIVisibility();
            navigateTo(user.role === 'USUARIO' ? 'view-client-portal' : 'view-dashboard');

            // Limpiar formulario
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
        } catch (e) {
            showToast(`❌ Error de autenticación: ${e.message}`, 'error');
        }
    }

    function handleApplicantRegistration(event) {
        event.preventDefault();

        const names = document.getElementById('register-names').value.trim();
        const surnames = document.getElementById('register-surnames').value.trim();
        const cedula = document.getElementById('register-cedula').value.trim();
        const email = document.getElementById('register-email').value.trim().toLowerCase();
        const password = document.getElementById('register-password').value;
        const confirmation = document.getElementById('register-password-confirm').value;

        if (password !== confirmation) {
            showToast('Las contraseñas no coinciden.', 'warning');
            document.getElementById('register-password-confirm').focus();
            return;
        }

        try {
            window.auth.registerApplicant({ names, surnames, cedula, email, password });
            const user = window.auth.login(email, password);
            event.target.reset();
            updateUIVisibility();
            navigateTo('view-client-portal');
            showToast(`Cuenta de demostración creada. Bienvenido/a, ${user.fullname}.`, 'success');
        } catch (error) {
            showToast(`No se pudo crear la cuenta: ${error.message}`, 'error');
        }
    }

    function handleLogout() {
        if (confirm('¿Desea cerrar su sesión del sistema?')) {
            let auditWarning = '';
            try {
                window.auth.logout();
            } catch (error) {
                auditWarning = error.message;
            }
            updateUIVisibility();
            navigateTo('view-home');
            if (auditWarning) {
                showToast(auditWarning, 'warning');
            } else {
                showToast('🚪 Sesión cerrada correctamente.', 'info');
            }
        }
    }

    // =====================================================
    // AUXILIARES
    // =====================================================
    function getStatusClass(status) {
        const maps = {
            'Pendiente': 'badge-secondary',
            'En proceso': 'badge-info',
            'Borrador generado': 'badge-warning',
            'En revisión': 'badge-warning',
            'Aprobado': 'badge-success',
            'Rechazado': 'badge-danger',
            'Finalizado': 'badge-success'
        };
        return maps[status] || 'badge-secondary';
    }

    function showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Animate
        requestAnimationFrame(() => toast.classList.add('toast-visible'));

        setTimeout(() => {
            toast.classList.remove('toast-visible');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    // =====================================================
    // CONFIGURACIÓN DE TEMA CLARO / OSCURO
    // =====================================================
    function initThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        const body = document.body;
        
        // Cargar por defecto dark-theme
        const activeTheme = localStorage.getItem('notaria_theme') || 'dark-theme';
        body.className = activeTheme;

        themeBtn?.addEventListener('click', () => {
            body.classList.toggle('dark-theme');
            body.classList.toggle('light-theme');
            localStorage.setItem('notaria_theme', body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme');
            showToast('🌗 Tema de visualización cambiado.', 'info');
        });
    }

    // =====================================================
    // INICIALIZACIÓN GENERAL DE LISTENERS
    // =====================================================
    function init() {
        // Iniciar base de datos local
        window.db.init();

        // Dibujar iconos de la interfaz inicial cuando la librería está disponible
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        // Cargar Tema
        initThemeToggle();

        // Enrutador de Sidebar
        document.querySelectorAll('.sidebar-menu .menu-item[data-target]').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.target));
        });

        // Configuración botón de Configuración en sidebar
        const setBtn = document.querySelector('.sidebar-footer [data-target="view-settings"]');
        if (setBtn) {
            setBtn.addEventListener('click', () => navigateTo('view-settings'));
        }

        // Búsqueda global top-bar
        const searchInput = document.getElementById('header-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', handleGlobalSearch);
            // Ocultar resultados al hacer clic fuera
            document.addEventListener('click', (e) => {
                const searchBox = document.getElementById('global-search-results');
                if (searchBox && !searchBox.contains(e.target) && e.target !== searchInput) {
                    searchBox.classList.add('hidden');
                }
            });
        }

        // Login Form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginFormSubmit);
        }
        const applicantForm = document.getElementById('applicant-register-form');
        if (applicantForm) {
            applicantForm.addEventListener('submit', handleApplicantRegistration);
        }

        // Formulario Clientes
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.addEventListener('submit', (e) => window.clients.saveClient(e));
        }

        // Formulario Trámites
        const procedureForm = document.getElementById('procedure-form');
        if (procedureForm) {
            procedureForm.addEventListener('submit', (e) => window.procedures.saveProcedure(e));
        }

        // Formulario Plantillas
        const templateForm = document.getElementById('template-form');
        if (templateForm) {
            templateForm.addEventListener('submit', (e) => window.templates.saveTemplate(e));
        }

        // Formulario Chat Asistente
        const chatForm = document.getElementById('chat-form-box');
        if (chatForm) {
            chatForm.addEventListener('submit', handleChatFormSubmit);
        }
        const selectorChat = document.getElementById('assistant-procedure-selector');
        if (selectorChat) {
            selectorChat.addEventListener('change', onAssistantProcedureChange);
        }

        // Formulario Configuración General
        const settingsForm = document.getElementById('settings-ai-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', saveSettings);
        }
        const modeSelect = document.getElementById('settings-ai-mode');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                const keyBox = document.getElementById('settings-key-container');
                if (keyBox) keyBox.classList.toggle('hidden', e.target.value !== 'gemini');
            });
        }

        // Botón reset base de datos
        const resetDbBtn = document.getElementById('settings-btn-reset-db');
        if (resetDbBtn) {
            resetDbBtn.addEventListener('click', () => {
                if (confirm('⚠️ ¿Está seguro de RESTABLECER la base de datos? Se eliminarán todos los clientes, trámites, documentos, auditorías y cambios personalizados. Esta acción es inalterable.')) {
                    window.db.reset();
                    showToast('🗑️ Base de datos restablecida. La aplicación se reiniciará.', 'info');
                    setTimeout(() => location.reload(), 1500);
                }
            });
        }

        // Dropdown Cambio de Rol Rápido (Debug Testing en la barra superior)
        const debugSelect = document.getElementById('debug-role-selector');
        if (debugSelect) {
            debugSelect.addEventListener('change', (e) => {
                const role = e.target.value;
                if (role) {
                    const switchedUser = window.auth.debugSwitchRole(role);
                    if (!switchedUser) {
                        const currentUser = window.auth.getCurrentUser();
                        debugSelect.value = currentUser?.role || '';
                        showToast('Solo el Administrador puede iniciar el cambio de rol de depuración.', 'error');
                        return;
                    }
                    showToast(`🔄 Rol depuración: Cambiado a ${role}`, 'success');
                    updateUIVisibility();
                    navigateTo(role === 'USUARIO' ? 'view-client-portal' : 'view-dashboard');
                }
            });
        }

        // Inicializar Estado de Interfaz al Cargar
        updateUIVisibility();
        
        const currentUser = window.auth.getCurrentUser();
        if (currentUser) {
            // Sincronizar dropdown de depuración con el rol actual
            if (debugSelect) debugSelect.value = currentUser.role;
            navigateTo(currentUser.role === 'USUARIO' ? 'view-client-portal' : 'view-dashboard');
        } else {
            navigateTo('view-home');
        }
    }

    // Exponer métodos globales de la app
    window.app = {
        navigateTo,
        getStatusClass,
        showToast,
        renderDashboard,
        handleLogout,
        viewProcedureDetail,
        startAssistantForProcedure,
        clickSearchResult,
        markNotificationRead,
        markAllNotificationsRead,
        toggleUserStatus,
        saveUserEmail,
        downloadClientDocument
    };

    document.addEventListener('DOMContentLoaded', init);
})();
